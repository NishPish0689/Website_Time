const SEROTYPES = ['DEN V 1', 'DEN V 2', 'DEN V 3', 'DEN V 4']
const NCBI_TAXON_TO_SEROTYPE = {
  11053: 'DEN V 1',
  11060: 'DEN V 2',
  11069: 'DEN V 3',
  11070: 'DEN V 4',
}
const COUNTRY_ALIASES = {
  'czech republic': 'czechia',
  iran: 'iran',
  'ivory coast': 'cotedivoire',
  reunion: 'reunion',
  russia: 'russianfederation',
  syria: 'syrianarabrepublic',
  tanzania: 'unitedrepublicoftanzania',
  usa: 'unitedstatesofamerica',
  'united states': 'unitedstatesofamerica',
  'viet nam': 'vietnam',
}

function presenceFlag(value) {
  if (value === true || String(value).toUpperCase() === 'TRUE') return true
  if (value === false || String(value).toUpperCase() === 'FALSE') return false
  return null
}

export function summarizeReports(records) {
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

export async function fetchDengueReports() {
  const today = new Date().toISOString().slice(0, 10)
  const twoYearsAgo = new Date()
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2)

  const url = new URL(
    'https://xmart-api-public.who.int/ARBOV/V_DENGUE_GLOBAL_VALIDATED_PUBLIC',
  )
  url.searchParams.set(
    '$filter',
    `START_DATE ge ${twoYearsAgo.toISOString().slice(0, 10)} and START_DATE le ${today}`,
  )
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

export async function fetchGenBankSerotypeRecords() {
  const endDate = new Date().toISOString().slice(0, 10)
  const start = new Date()
  start.setUTCFullYear(start.getUTCFullYear() - 2)

  const url = new URL(
    'https://api.ncbi.nlm.nih.gov/datasets/v2/virus/taxon/12637/dataset_report',
  )
  url.searchParams.set('filter.released_since', start.toISOString().slice(0, 10))
  url.searchParams.set('filter.host', '9606')
  url.searchParams.set('page_size', '1000')

  const records = []
  let nextPageToken
  do {
    if (nextPageToken) {
      url.searchParams.set('page_token', nextPageToken)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`NCBI GenBank request failed (${response.status}).`)
    }

    const payload = await response.json()
    if (!Array.isArray(payload.reports)) {
      throw new Error('NCBI returned an unexpected genome data format.')
    }

    records.push(...payload.reports)
    nextPageToken = payload.next_page_token || undefined
  } while (nextPageToken)

  return { records, startDate: start.toISOString().slice(0, 10), endDate }
}

export function createCountryCodeLookup(features) {
  const countryCodeByName = new Map()
  for (const feature of features) {
    const code = getCountryCode(feature.properties)
    if (!code) continue
    for (const key of ['ADMIN', 'NAME', 'NAME_LONG', 'FORMAL_EN']) {
      const name = feature.properties[key]
      if (typeof name === 'string' && name) {
        countryCodeByName.set(normalizeCountryName(name), code)
      }
    }
  }

  for (const [alias, countryName] of Object.entries(COUNTRY_ALIASES)) {
    const countryCode = countryCodeByName.get(normalizeCountryName(countryName))
    if (countryCode) countryCodeByName.set(normalizeCountryName(alias), countryCode)
  }

  return countryCodeByName
}

export function summarizeGenBankRecords(
  records,
  countryCodeByName,
  startDate,
  endDate,
) {
  const typedRecordsByCountry = new Map()

  for (const record of records) {
    const collectionDate = record.isolate?.collection_date
    if (
      record.source_database !== 'GenBank' ||
      typeof collectionDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate) ||
      collectionDate < startDate ||
      collectionDate > endDate
    ) {
      continue
    }

    const rawCountry = record.location?.geographic_location?.split(':')[0]?.trim()
    const countryCode = countryCodeByName.get(normalizeCountryName(rawCountry))
    const serotype = getNcbiSerotype(record.virus)
    if (!countryCode || !serotype) continue

    const typedRecords = typedRecordsByCountry.get(countryCode) ?? []
    typedRecords.push(serotype)
    typedRecordsByCountry.set(countryCode, typedRecords)
  }

  const summaries = new Map()
  for (const [iso3, typedRecords] of typedRecordsByCountry) {
    const serotypeCounts = Object.fromEntries(SEROTYPES.map((type) => [type, 0]))
    for (const serotype of typedRecords) serotypeCounts[serotype] += 1

    const serotypeReportCount = typedRecords.length
    const serotypePercentages = Object.fromEntries(
      SEROTYPES.map((type) => [
        type,
        (serotypeCounts[type] / serotypeReportCount) * 100,
      ]),
    )
    const highestCount = Math.max(...Object.values(serotypeCounts))
    const mostReported = SEROTYPES.filter(
      (type) => serotypeCounts[type] === highestCount,
    )

    summaries.set(iso3, {
      iso3,
      latest: null,
      serotypeCounts,
      serotypePercentages,
      serotypeReportCount,
      dominantSerotype: mostReported.length === 1 ? mostReported[0] : null,
      serotypeSource: 'GenBank',
    })
  }

  return summaries
}

export function mergeGenBankFallback(whoSummaries, genBankSummaries) {
  for (const [iso3, genBankSummary] of genBankSummaries) {
    const whoSummary = whoSummaries.get(iso3)
    if (whoSummary?.serotypeReportCount) continue

    whoSummaries.set(iso3, {
      ...(whoSummary ?? { iso3, latest: null }),
      serotypeCounts: genBankSummary.serotypeCounts,
      serotypePercentages: genBankSummary.serotypePercentages,
      serotypeReportCount: genBankSummary.serotypeReportCount,
      dominantSerotype: genBankSummary.dominantSerotype,
      serotypeSource: genBankSummary.serotypeSource,
    })
  }

  return whoSummaries
}

function normalizeCountryName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getNcbiSerotype(virus) {
  const taxonSerotype = NCBI_TAXON_TO_SEROTYPE[virus?.tax_id]
  if (taxonSerotype) return taxonSerotype

  const match = String(virus?.organism_name ?? '').match(
    /\btype\s*(1|2|3|4|iv|iii|ii|i)\b/i,
  )
  if (!match) return null

  const serotypeNumber =
    /^\d$/.test(match[1])
      ? match[1]
      : { i: '1', ii: '2', iii: '3', iv: '4' }[match[1].toLowerCase()]
  return `DEN V ${serotypeNumber}`
}

function getCountryCode(properties) {
  return properties.ISO_A3_EH && properties.ISO_A3_EH !== '-99'
    ? properties.ISO_A3_EH
    : properties.ADM0_A3
}
