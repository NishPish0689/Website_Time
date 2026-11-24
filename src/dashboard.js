import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './dashboard.css'
import {
  createCountryCodeLookup,
  fetchDengueReports,
  fetchGenBankSerotypeRecords,
  mergeGenBankFallback,
  summarizeGenBankRecords,
  summarizeReports,
} from './dengue-data.js'

const SEROTYPE_COLORS = {
  'DEN V 1': '#22d3ee',
  'DEN V 2': '#facc15',
  'DEN V 3': '#fb7185',
  'DEN V 4': '#a78bfa',
}
const UNREPORTED_COLOR = '#54545f'
const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

export async function mountDashboard(root, clerk) {
  const userName =
    clerk.user?.fullName ||
    clerk.user?.primaryEmailAddress?.emailAddress ||
    'Account'
  root.innerHTML = `
    <div class="dashboard-shell">
      <header class="dashboard-header">
        <div class="dashboard-brand">
          <span class="dashboard-brand-mark" aria-hidden="true">D</span>
          <div>
            <p class="dashboard-kicker">PUBLIC HEALTH OVERVIEW</p>
            <h1>Dengue Detection System</h1>
          </div>
        </div>
        <div class="dashboard-account">
          <span class="account-name">${escapeHtml(userName)}</span>
          <button class="dashboard-sign-out" type="button">Sign out</button>
        </div>
      </header>

      <main>
        <nav class="dashboard-nav" role="tablist" aria-label="Dashboard sections">
          <button id="map-tab" class="dashboard-tab" type="button" role="tab" aria-selected="true" aria-controls="map-view" tabindex="0">Surveillance map</button>
          <button id="checkin-tab" class="dashboard-tab" type="button" role="tab" aria-selected="false" aria-controls="checkin-view" tabindex="-1">Symptoms &amp; local guidance</button>
        </nav>

        <section id="map-view" class="dashboard-view" role="tabpanel" aria-labelledby="map-tab" tabindex="0">
        <section class="dashboard-intro">
          <div>
            <p class="dashboard-kicker">GLOBAL SURVEILLANCE</p>
            <h2>Dengue activity by country</h2>
            <p class="dashboard-description">
              Explore reported cases and which dengue serotypes appear most often in surveillance reports.
            </p>
          </div>
          <div class="data-window">
            <span class="status-dot" aria-hidden="true"></span>
            <span id="data-status" role="status" aria-live="polite">Loading WHO and GenBank data...</span>
          </div>
        </section>

        <section class="map-card" aria-label="World dengue surveillance map">
          <div class="map-toolbar">
            <div>
              <h3>World map</h3>
              <p>Hover for a quick report. Select a country for serotype percentages.</p>
            </div>
            <div class="map-actions">
              <label class="sr-only" for="country-picker">Choose a country</label>
              <select id="country-picker">
                <option value="">Choose a country</option>
              </select>
              <button id="refresh-data" class="refresh-button" type="button">Refresh data</button>
            </div>
          </div>

          <div class="map-content">
            <div id="dengue-map" role="application" aria-label="Interactive world map. Hover over a country for dengue case details and click to select it."></div>
            <aside class="country-panel" aria-live="polite">
              <p class="dashboard-kicker">COUNTRY REPORT</p>
              <h3 id="country-name">Choose a country</h3>
              <p id="country-period" class="country-period">Select a country on the map.</p>
              <dl class="country-metrics">
                <div>
                  <dt>Latest WHO-reported cases</dt>
                  <dd id="country-cases">—</dd>
                </div>
                <div>
                  <dt id="serotype-count-label">Serotype reports analyzed</dt>
                  <dd id="country-serotype-reports">—</dd>
                </div>
              </dl>
              <section class="serotype-analysis" aria-labelledby="serotype-analysis-title">
                <h4 id="serotype-analysis-title">Serotype presence by report</h4>
                <p id="serotype-analysis-note" class="serotype-analysis-note">Percentage of WHO reports with serotype results that flagged each type.</p>
                <div id="serotype-breakdown"></div>
              </section>
              <p id="country-note" class="country-note">
                WHO reports are country-level; India is shown as one country.
              </p>
            </aside>
          </div>

          <div class="map-legend" aria-label="Map legend">
            <span class="legend-heading">Most frequently reported serotype</span>
            ${Object.entries(SEROTYPE_COLORS)
              .map(
                ([serotype, color]) => `
                  <span class="legend-item">
                    <i class="legend-swatch" style="--swatch-color:${color}" aria-hidden="true"></i>
                    ${serotype}
                  </span>
                `,
              )
              .join('')}
            <span class="legend-item">
              <i class="legend-swatch" style="--swatch-color:${UNREPORTED_COLOR}" aria-hidden="true"></i>
              Tie / not reported
            </span>
          </div>
          <p id="data-warning" class="data-warning" role="status" aria-live="polite"></p>
        </section>

        <footer class="dashboard-footer">
          <p>
            WHO flags are used first; where WHO has no serotype data, NCBI GenBank human sequence
            submissions are used as a fallback. WHO percentages are the share of typed reports
            flagging each type. GenBank percentages are the share of recent typed sequences and
            are not population prevalence estimates. Mixed WHO reports can flag multiple types.
            Ties and missing data are neutral.
          </p>
          <p>
            Sources:
            <a href="https://worldhealthorg.shinyapps.io/dengue_global/" target="_blank" rel="noreferrer">WHO Global Dengue Surveillance</a>,
            <a href="https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/data-packages/virus-genome/" target="_blank" rel="noreferrer">NCBI GenBank dengue sequences</a>,
            map boundaries from <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>.
          </p>
        </footer>
        </section>

        <section id="checkin-view" class="dashboard-view" role="tabpanel" aria-labelledby="checkin-tab" tabindex="0" hidden>
        <section class="checkin-card" aria-labelledby="checkin-title">
          <div class="checkin-heading">
            <p class="dashboard-kicker">LOCAL CHECK-IN</p>
            <h2 id="checkin-title">Get dengue guidance for your area</h2>
            <p>
              Share a country and optional city or area to see the available local surveillance
              summary and review symptoms to watch for.
            </p>
          </div>
          <form id="location-checkin">
            <div class="checkin-location-fields">
              <div class="checkin-field">
                <label for="checkin-country">Country</label>
                <select id="checkin-country" name="country" required>
                  <option value="">Choose a country</option>
                </select>
              </div>
              <div class="checkin-field">
                <label for="checkin-area">City or area <span>(optional)</span></label>
                <input id="checkin-area" name="area" type="text" maxlength="80" autocomplete="address-level2" placeholder="For example, Bangkok">
              </div>
            </div>

            <fieldset class="symptom-fieldset">
              <legend>Are you experiencing any of these symptoms?</legend>
              <p class="checkin-help">Select all that apply. This check-in does not diagnose dengue.</p>
              <div class="symptom-options">
                <label><input type="checkbox" name="symptoms" value="High fever"> High fever</label>
                <label><input type="checkbox" name="symptoms" value="Severe headache or pain behind the eyes"> Severe headache or pain behind the eyes</label>
                <label><input type="checkbox" name="symptoms" value="Muscle, joint, or bone pain"> Muscle, joint, or bone pain</label>
                <label><input type="checkbox" name="symptoms" value="Nausea or vomiting"> Nausea or vomiting</label>
                <label><input type="checkbox" name="symptoms" value="Rash"> Rash</label>
              </div>
            </fieldset>

            <button class="checkin-button" type="submit">Show local guidance</button>
            <p class="checkin-privacy">Your check-in stays on this page. It is not sent or saved, and you do not need to share an exact address.</p>
          </form>

          <div id="checkin-result" class="checkin-result" role="status" aria-live="polite" hidden></div>
          <aside class="warning-signs" aria-labelledby="warning-signs-title">
            <h3 id="warning-signs-title">Get urgent medical care for warning signs</h3>
            <p>Severe abdominal pain, repeated vomiting, bleeding from the nose or gums, blood in vomit or stool, rapid breathing, or unusual tiredness or restlessness need urgent medical attention. Warning signs can appear as a fever goes away.</p>
          </aside>
          <p class="variant-disclaimer">
            Dengue serotypes (DENV-1 to DENV-4) cannot be identified by symptoms. The local surveillance result is not a diagnosis or a prediction of which type an individual may have. A health professional can assess symptoms and arrange testing.
          </p>
        </section>
        </section>
        <p id="dashboard-error" class="dashboard-error" role="alert"></p>
      </main>
    </div>
  `

  const signOutButton = root.querySelector('.dashboard-sign-out')
  const dashboardError = root.querySelector('#dashboard-error')
  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true
    signOutButton.textContent = 'Signing out...'
    try {
      await clerk.signOut()
    } catch (error) {
      signOutButton.disabled = false
      signOutButton.textContent = 'Sign out'
      dashboardError.textContent = `Unable to sign out: ${error.message}`
    }
  })

  const mapElement = root.querySelector('#dengue-map')
  const countryPicker = root.querySelector('#country-picker')
  const checkinCountry = root.querySelector('#checkin-country')
  const checkinForm = root.querySelector('#location-checkin')
  const checkinResult = root.querySelector('#checkin-result')
  const dataStatus = root.querySelector('#data-status')
  const dataWarning = root.querySelector('#data-warning')
  const refreshButton = root.querySelector('#refresh-data')
  const map = L.map(mapElement, {
    zoomControl: true,
    minZoom: 1,
    maxZoom: 6,
    worldCopyJump: true,
    attributionControl: false,
  }).setView([18, 0], 1.45)

  const dashboardTabs = [...root.querySelectorAll('[role="tab"]')]
  const mapView = root.querySelector('#map-view')
  const checkinView = root.querySelector('#checkin-view')
  function activateDashboardTab(activeTab) {
    const showMap = activeTab.id === 'map-tab'
    mapView.hidden = !showMap
    checkinView.hidden = showMap
    dashboardTabs.forEach((tab) => {
      const isActive = tab === activeTab
      tab.setAttribute('aria-selected', String(isActive))
      tab.tabIndex = isActive ? 0 : -1
    })
    if (showMap) requestAnimationFrame(() => map.invalidateSize())
  }

  dashboardTabs.forEach((tab) => {
    tab.addEventListener('click', () => activateDashboardTab(tab))
    tab.addEventListener('keydown', (event) => {
      const currentIndex = dashboardTabs.indexOf(tab)
      let nextIndex
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % dashboardTabs.length
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + dashboardTabs.length) % dashboardTabs.length
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = dashboardTabs.length - 1
      if (nextIndex === undefined) return

      event.preventDefault()
      const nextTab = dashboardTabs[nextIndex]
      activateDashboardTab(nextTab)
      nextTab.focus()
    })
  })

  let countryLayer
  let selectedCode = ''
  let summaries = new Map()

  const boundaryResponse = await fetch('/world-countries.geojson')
  if (!boundaryResponse.ok) {
    throw new Error(`Could not load country boundaries (${boundaryResponse.status}).`)
  }
  const boundaries = await boundaryResponse.json()
  const countryCodeByName = createCountryCodeLookup(boundaries.features)
  const countries = boundaries.features
    .map((feature) => ({
      feature,
      code: getCountryCode(feature.properties),
      name: feature.properties.ADMIN,
    }))
    .filter(({ code, name }) => code && name)
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const country of countries) {
    const option = document.createElement('option')
    option.value = country.code
    option.textContent = country.name
    countryPicker.append(option)

    const checkinOption = option.cloneNode(true)
    checkinCountry.append(checkinOption)
  }

  function getStyle(code, selected = false) {
    const serotype = summaries.get(code)?.dominantSerotype
    return {
      color: selected ? '#ffffff' : '#30303a',
      weight: selected ? 1.5 : 0.65,
      opacity: 1,
      fillColor: SEROTYPE_COLORS[serotype] ?? UNREPORTED_COLOR,
      fillOpacity: selected ? 0.95 : 0.8,
    }
  }

  countryLayer = L.geoJSON(boundaries, {
    style: (feature) => getStyle(getCountryCode(feature.properties)),
    onEachFeature(feature, layer) {
      const code = getCountryCode(feature.properties)
      const name = feature.properties.ADMIN
      layer.bindTooltip('', {
        className: 'dengue-tooltip',
        direction: 'auto',
        sticky: true,
        opacity: 1,
      })
      layer.on({
        mouseover() {
          layer.setTooltipContent(makeTooltip(name, summaries.get(code)))
          if (selectedCode !== code) {
            layer.setStyle({ color: '#ffffff', weight: 1.3, fillOpacity: 0.95 })
          }
        },
        mouseout() {
          layer.setStyle(getStyle(code, selectedCode === code))
        },
        click() {
          selectCountry(code, name)
        },
      })
    },
  }).addTo(map)

  function selectCountry(code, name) {
    selectedCode = code
    countryPicker.value = code
    countryLayer.setStyle((feature) =>
      getStyle(getCountryCode(feature.properties), getCountryCode(feature.properties) === code),
    )
    renderCountryDetails(name, summaries.get(code))
  }

  function renderCountryDetails(name, summary) {
    root.querySelector('#country-name').textContent = name
    root.querySelector('#country-cases').textContent = summary?.latest
      ? numberFormat.format(summary.latest.CASES)
      : 'Not reported'
    root.querySelector('#country-period').textContent = summary?.latest
      ? `${formatDate(summary.latest.START_DATE)} · ${formatPeriod(summary.latest.DATE_TYPE)}`
      : 'No WHO case count reported in the last two years.'

    root.querySelector('#serotype-count-label').textContent =
      summary?.serotypeSource === 'GenBank'
        ? 'Sequences analyzed'
        : 'Serotype reports analyzed'
    root.querySelector('#country-serotype-reports').textContent =
      summary?.serotypeReportCount
        ? numberFormat.format(summary.serotypeReportCount)
        : 'Not reported'
    renderSerotypeBreakdown(root.querySelector('#serotype-breakdown'), summary)
    root.querySelector('#serotype-analysis-title').textContent =
      summary?.serotypeSource === 'GenBank'
        ? 'Serotype distribution in sequences'
        : 'Serotype presence by report'
    root.querySelector('#serotype-analysis-note').textContent =
      summary?.serotypeSource === 'GenBank'
        ? 'Share of recent GenBank sequences by serotype; sequence sampling is not population prevalence.'
        : 'Percentage of WHO reports with serotype results that flagged each type.'
    const note = root.querySelector('#country-note')
    note.textContent = summary?.serotypeSource === 'GenBank'
      ? 'Fallback source: recent human dengue sequences in NCBI GenBank. Sequence coverage is uneven and is not case surveillance.'
      : summary?.serotypeReportCount
        ? 'Source: WHO country-level surveillance reports from the last two years; India is shown as one country.'
      : 'No recent WHO serotype results or eligible GenBank sequences are available. No values are estimated.'
  }

  let submittedCheckin = null
  function renderCheckinResult() {
    if (!submittedCheckin) return

    const { country, area, symptoms } = submittedCheckin
    const localSummary = summaries.get(country.code)
    const location = area ? `${area}, ${country.name}` : country.name
    const resultParts = [
      `For ${location}:`,
      localSummary?.dominantSerotype
        ? `The available surveillance data most often reports ${localSummary.dominantSerotype} here.`
        : 'There is no single most-reported serotype in the available local data.',
    ]

    if (symptoms.length) {
      resultParts.push(`Symptoms you selected: ${symptoms.join(', ')}.`)
      resultParts.push('These symptoms can have many causes; contact a healthcare professional for advice.')
    } else {
      resultParts.push('No symptoms selected. Review the warning signs below and seek medical advice if you feel unwell.')
    }

    checkinResult.textContent = resultParts.join(' ')
    checkinResult.hidden = false
  }

  checkinForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const country = countries.find((item) => item.code === checkinCountry.value)
    if (!country) {
      checkinCountry.focus()
      return
    }

    submittedCheckin = {
      country,
      area: root.querySelector('#checkin-area').value.trim(),
      symptoms: [...checkinForm.querySelectorAll('input[name="symptoms"]:checked')]
        .map((input) => input.value),
    }
    renderCheckinResult()
  })

  countryPicker.addEventListener('change', () => {
    const country = countries.find((item) => item.code === countryPicker.value)
    if (country) selectCountry(country.code, country.name)
  })

  async function refreshData() {
    refreshButton.disabled = true
    refreshButton.textContent = 'Refreshing...'
    dataStatus.textContent = 'Loading WHO and NCBI GenBank data...'
    dataWarning.textContent = ''

    try {
      const [whoResult, genBankResult] = await Promise.allSettled([
        fetchDengueReports(),
        fetchGenBankSerotypeRecords(),
      ])
      const sourceErrors = []
      let reports = []
      let whoSummaries = new Map()
      let genBankSummaries = new Map()
      let genBankFallbackCountryCount = 0

      if (whoResult.status === 'fulfilled') {
        reports = whoResult.value
        whoSummaries = summarizeReports(reports)
      } else {
        sourceErrors.push(`WHO: ${whoResult.reason.message}`)
      }

      if (genBankResult.status === 'fulfilled') {
        const { records, startDate, endDate } = genBankResult.value
        genBankSummaries = summarizeGenBankRecords(
          records,
          countryCodeByName,
          startDate,
          endDate,
        )
        genBankFallbackCountryCount = [...genBankSummaries.keys()].filter(
          (iso3) => !whoSummaries.get(iso3)?.serotypeReportCount,
        ).length
      } else {
        sourceErrors.push(`NCBI GenBank: ${genBankResult.reason.message}`)
      }

      if (sourceErrors.length === 2) {
        throw new Error(sourceErrors.join(' '))
      }
      summaries = mergeGenBankFallback(whoSummaries, genBankSummaries)
      countryLayer.setStyle((feature) =>
        getStyle(
          getCountryCode(feature.properties),
          getCountryCode(feature.properties) === selectedCode,
        ),
      )

      const latestDate = reports.reduce(
        (latest, report) =>
          report.START_DATE > latest ? report.START_DATE : latest,
        '',
      )
      const whoCountries = [...whoSummaries.values()].filter(
        (summary) => summary.latest,
      ).length
      const sourceStatus = [
        whoResult.status === 'fulfilled'
          ? `WHO ${whoCountries} countries${latestDate ? ` through ${formatDate(latestDate)}` : ''}`
          : null,
        genBankResult.status === 'fulfilled'
          ? `GenBank ${genBankSummaries.size} countries · ${genBankFallbackCountryCount} filling WHO gaps`
          : null,
      ].filter(Boolean)
      dataStatus.textContent = sourceStatus.join(' · ') || 'No dengue data available.'
      if (sourceErrors.length) {
        console.error('Some dengue data sources could not be loaded.', sourceErrors)
        dataWarning.textContent = sourceErrors.join(' ')
      }
      if (selectedCode) {
        const selected = countries.find((country) => country.code === selectedCode)
        if (selected) renderCountryDetails(selected.name, summaries.get(selectedCode))
      }
      renderCheckinResult()
    } catch (error) {
      console.error('Dengue surveillance data could not be loaded.', error)
      dataStatus.textContent = 'WHO surveillance data could not be loaded.'
      dataWarning.textContent = error.message
    } finally {
      refreshButton.disabled = false
      refreshButton.textContent = 'Refresh data'
    }
  }

  refreshButton.addEventListener('click', refreshData)
  void refreshData()
}

function getCountryCode(properties) {
  return properties.ISO_A3_EH && properties.ISO_A3_EH !== '-99'
    ? properties.ISO_A3_EH
    : properties.ADM0_A3
}

function makeTooltip(name, summary) {
  if (!summary) {
    return `<strong>${escapeHtml(name)}</strong><span>No recent WHO or NCBI serotype data</span>`
  }

  const dominantLabel = summary.serotypeSource === 'GenBank' ? 'Most sequenced' : 'Most flagged'
  const serotypeSummary = summary.dominantSerotype
    ? `${dominantLabel}: ${summary.dominantSerotype} (${percentFormat.format(summary.serotypePercentages[summary.dominantSerotype])}%)`
    : 'No unique most-flagged serotype'
  const source = summary.serotypeSource === 'GenBank' ? 'NCBI sequence data' : 'WHO surveillance'
  return `
    <strong>${escapeHtml(name)}</strong>
    <span>${summary.latest ? `WHO: ${numberFormat.format(summary.latest.CASES)} cases · ${formatDate(summary.latest.START_DATE)}` : 'WHO case count not reported'}</span>
    <span>${escapeHtml(serotypeSummary)}</span>
    <span>${summary.serotypeReportCount ? `${numberFormat.format(summary.serotypeReportCount)} ${summary.serotypeSource === 'GenBank' ? 'sequences' : 'serotype reports'} · ${source}` : 'Serotype data not reported'}</span>
  `
}

function renderSerotypeBreakdown(container, summary) {
  if (!summary?.serotypeReportCount) {
    container.innerHTML = '<p class="serotype-unavailable">Serotype percentages are not reported.</p>'
    return
  }

  container.innerHTML = Object.entries(SEROTYPE_COLORS)
    .map(([serotype, color]) => {
      const percentage = summary.serotypePercentages[serotype]
      return `
        <div class="serotype-row">
          <div class="serotype-row-label">
            <span><i class="legend-swatch" style="--swatch-color:${color}" aria-hidden="true"></i>${serotype}</span>
            <strong>${percentFormat.format(percentage)}%</strong>
          </div>
          <div class="serotype-track" role="meter" aria-label="${serotype} report presence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
            <span style="--swatch-color:${color};--bar-width:${Math.min(percentage, 100)}%"></span>
          </div>
          <p>${numberFormat.format(summary.serotypeCounts[serotype])} of ${numberFormat.format(summary.serotypeReportCount)} ${summary.serotypeSource === 'GenBank' ? 'sequences' : 'reports'}</p>
        </div>
      `
    })
    .join('')
}

function formatPeriod(value) {
  if (value === 'epiweek') return 'weekly report'
  if (value === 'month') return 'monthly report'
  return `${value || 'unknown'} report`
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}
