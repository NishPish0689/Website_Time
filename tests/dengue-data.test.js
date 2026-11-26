import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchDengueReports,
  hasCasesWithoutDominantSerotype,
  summarizeReports,
} from '../src/dengue-data.js'

test('fetches all available WHO history and follows pagination', async () => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    return {
      ok: true,
      json: async () =>
        requestedUrls.length === 1
          ? {
              value: [{ ISO3: 'AAA', START_DATE: '2021-01-01', CASES: 1 }],
              '@odata.nextLink': 'https://who.example/page/2',
            }
          : { value: [{ ISO3: 'BBB', START_DATE: '2026-01-01', CASES: 2 }] },
    }
  }

  try {
    const reports = await fetchDengueReports()

    assert.equal(requestedUrls.length, 2)
    assert.equal(reports.length, 2)
    const filter = new URL(requestedUrls[0]).searchParams.get('$filter')
    assert.match(filter, /^START_DATE le \d{4}-\d{2}-\d{2}$/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('finds the most frequently flagged type and calculates report percentages', () => {
  const summaries = summarizeReports([
    {
      ISO3: 'AAA',
      START_DATE: '2026-04-01',
      CASES: 300,
      SERO_1: 'TRUE',
      SERO_2: 'TRUE',
      SERO_3: 'FALSE',
      SERO_4: 'FALSE',
    },
    {
      ISO3: 'AAA',
      START_DATE: '2026-03-01',
      CASES: 100,
      SERO_1: 'TRUE',
      SERO_2: 'FALSE',
      SERO_3: 'FALSE',
      SERO_4: 'FALSE',
    },
    {
      ISO3: 'AAA',
      START_DATE: '2026-02-01',
      CASES: 50,
      SERO_1: 'TRUE',
      SERO_2: 'FALSE',
      SERO_3: 'TRUE',
      SERO_4: 'FALSE',
    },
    {
      ISO3: 'AAA',
      START_DATE: '2026-01-01',
      CASES: 25,
      SERO_1: 'FALSE',
      SERO_2: 'FALSE',
      SERO_3: 'FALSE',
      SERO_4: 'FALSE',
    },
  ])
  const country = summaries.get('AAA')

  assert.equal(country.latest.CASES, 300)
  assert.equal(country.serotypeReportCount, 4)
  assert.equal(country.serotypeCounts['DEN V 1'], 3)
  assert.equal(country.serotypePercentages['DEN V 1'], 75)
  assert.equal(country.serotypePercentages['DEN V 2'], 25)
  assert.equal(country.dominantSerotype, 'DEN V 1')
})

test('leaves a tie without a dominant color and allows percentages above 100 in mixed reports', () => {
  const summaries = summarizeReports([
    {
      ISO3: 'BBB',
      START_DATE: '2026-04-01',
      CASES: 5,
      SERO_1: true,
      SERO_2: true,
      SERO_3: false,
      SERO_4: false,
    },
    {
      ISO3: 'BBB',
      START_DATE: '2026-03-01',
      CASES: 2,
      SERO_1: false,
      SERO_2: false,
      SERO_3: true,
      SERO_4: false,
    },
  ])
  const country = summaries.get('BBB')

  assert.equal(country.serotypePercentages['DEN V 1'], 50)
  assert.equal(country.serotypePercentages['DEN V 2'], 50)
  assert.equal(country.serotypePercentages['DEN V 3'], 50)
  assert.equal(country.dominantSerotype, null)
})

test('keeps serotype results even when case counts are absent', () => {
  const summaries = summarizeReports([
    {
      ISO3: 'CCC',
      START_DATE: '2026-04-01',
      CASES: null,
      SERO_1: 'TRUE',
      SERO_2: 'FALSE',
      SERO_3: null,
      SERO_4: null,
    },
    {
      ISO3: 'DDD',
      START_DATE: '2026-04-01',
      CASES: 0,
      SERO_1: null,
      SERO_2: null,
      SERO_3: null,
      SERO_4: null,
    },
  ])

  assert.equal(summaries.get('CCC').latest, undefined)
  assert.equal(summaries.get('CCC').serotypePercentages['DEN V 1'], 100)
  assert.equal(summaries.get('CCC').dominantSerotype, 'DEN V 1')
  assert.equal(summaries.get('DDD').latest.CASES, 0)
  assert.equal(summaries.get('DDD').serotypeReportCount, 0)
  assert.equal(summaries.get('DDD').serotypePercentages['DEN V 1'], null)
  assert.equal(summaries.get('DDD').dominantSerotype, null)
})

test('keeps historical WHO case counts while limiting serotypes to the requested recent window', () => {
  const country = summarizeReports(
    [
      {
        ISO3: 'AAA',
        START_DATE: '2021-04-01',
        CASES: 10,
        SERO_1: 'TRUE',
        SERO_2: 'FALSE',
        SERO_3: 'FALSE',
        SERO_4: 'FALSE',
      },
      {
        ISO3: 'AAA',
        START_DATE: '2026-04-01',
        CASES: null,
        SERO_1: null,
        SERO_2: null,
        SERO_3: null,
        SERO_4: null,
      },
    ],
    '2024-01-01',
  ).get('AAA')

  assert.equal(country.latest.CASES, 10)
  assert.equal(country.latest.START_DATE, '2021-04-01')
  assert.equal(country.serotypeReportCount, 0)
  assert.equal(country.dominantSerotype, null)
})

test('identifies positive case reports without a unique serotype separately from zero cases', () => {
  const noSerotype = summarizeReports([
    {
      ISO3: 'AAA',
      START_DATE: '2026-04-01',
      CASES: 4,
      SERO_1: null,
      SERO_2: null,
      SERO_3: null,
      SERO_4: null,
    },
  ]).get('AAA')
  const tie = summarizeReports([
    {
      ISO3: 'BBB',
      START_DATE: '2026-04-01',
      CASES: 4,
      SERO_1: true,
      SERO_2: true,
      SERO_3: false,
      SERO_4: false,
    },
  ]).get('BBB')
  const zeroCases = summarizeReports([
    {
      ISO3: 'CCC',
      START_DATE: '2026-04-01',
      CASES: 0,
      SERO_1: null,
      SERO_2: null,
      SERO_3: null,
      SERO_4: null,
    },
  ]).get('CCC')

  assert.equal(hasCasesWithoutDominantSerotype(noSerotype), true)
  assert.equal(hasCasesWithoutDominantSerotype(tie), true)
  assert.equal(hasCasesWithoutDominantSerotype(zeroCases), false)
  assert.equal(hasCasesWithoutDominantSerotype(undefined), false)
})
