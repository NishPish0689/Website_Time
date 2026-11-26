const SEROTYPES = ['DEN V 1', 'DEN V 2', 'DEN V 3', 'DEN V 4']

function presenceFlag(value) {
  if (value === true || String(value).toUpperCase() === 'TRUE') return true
  if (value === false || String(value).toUpperCase() === 'FALSE') return false
  return null
}

export function summarizeReports(records, serotypeStartDate = '') {
  const recordsByCountry = new Map()

  for (const record of records) {
    const iso3 = record.ISO3
    if (
      typeof iso3 !== 'string' ||
      !/^[A-Z]{3}$/.test(iso3) ||
      !record.START_DATE
    ) {
      continue
    }

    const countryRecords = recordsByCountry.get(iso3) ?? []
    countryRecords.push(record)
    recordsByCountry.set(iso3, countryRecords)
  }

  const summaries = new Map()

  for (const [iso3, countryRecords] of recordsByCountry) {
    countryRecords.sort((a, b) => b.START_DATE.localeCompare(a.START_DATE))
    const latest = countryRecords.find(
      (record) =>
        record.CASES !== null &&
        record.CASES !== undefined &&
        record.CASES !== '' &&
        Number.isFinite(Number(record.CASES)) &&
        Number(record.CASES) >= 0,
    )
    const serotypeCounts = Object.fromEntries(SEROTYPES.map((type) => [type, 0]))
    let serotypeReportCount = 0

    for (const record of countryRecords) {
      if (serotypeStartDate && record.START_DATE < serotypeStartDate) continue
      const flags = SEROTYPES.map((_, index) =>
        presenceFlag(record[`SERO_${index + 1}`]),
      )
      if (flags.every((flag) => flag === null)) continue
      serotypeReportCount += 1
      flags.forEach((flag, index) => {
        if (flag === true) serotypeCounts[SEROTYPES[index]] += 1
      })
    }

    const serotypePercentages = Object.fromEntries(
      SEROTYPES.map((type) => [
        type,
        serotypeReportCount
          ? (serotypeCounts[type] / serotypeReportCount) * 100
          : null,
      ]),
    )
    const highestCount = Math.max(...Object.values(serotypeCounts))
    const mostReported = SEROTYPES.filter(
      (type) => serotypeCounts[type] === highestCount && highestCount > 0,
    )

    summaries.set(iso3, {
      iso3,
      latest,
      serotypeCounts,
      serotypePercentages,
      serotypeReportCount,
      dominantSerotype: mostReported.length === 1 ? mostReported[0] : null,
      serotypeSource: serotypeReportCount ? 'WHO' : null,
    })
  }

  return summaries
}

export function hasCasesWithoutSerotype(summary) {
  const caseCount = Number(summary?.latest?.CASES)
  return (
    Number.isFinite(caseCount) &&
    caseCount > 0 &&
    !summary?.serotypeReportCount
  )
}

export async function fetchDengueReports() {
  const today = new Date().toISOString().slice(0, 10)
  const url = new URL(
    'https://xmart-api-public.who.int/ARBOV/V_DENGUE_GLOBAL_VALIDATED_PUBLIC',
  )
  url.searchParams.set('$filter', `START_DATE le ${today}`)
  url.searchParams.set('$orderby', 'START_DATE desc')
  url.searchParams.set(
    '$select',
    'COUNTRY,ISO3,START_DATE,DATE_TYPE,YEAR,CASES,SERO_1,SERO_2,SERO_3,SERO_4',
  )

  const reports = []
  let nextUrl = url
  while (nextUrl) {
    const response = await fetch(nextUrl)
    if (!response.ok) {
      throw new Error(`WHO dengue data request failed (${response.status}).`)
    }

    const payload = await response.json()
    if (!Array.isArray(payload.value)) {
      throw new Error('WHO returned an unexpected dengue data format.')
    }

    reports.push(...payload.value)
    nextUrl = payload['@odata.nextLink'] ?? null
  }

  return reports
}
