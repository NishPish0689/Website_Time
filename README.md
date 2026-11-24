# Dengue Detection System

1. Create a Clerk application and copy its publishable key.
2. Copy `.env.example` to `.env` and replace the sample value with your key.
3. Install dependencies and start the development server:

   - Windows PowerShell: `npm.cmd install`, then `npm.cmd run dev`
   - macOS, Linux, or Command Prompt: `npm install`, then `npm run dev`

   In PowerShell, `npm.cmd` avoids execution-policy errors that can block the
   `npm.ps1` launcher.

Open the local URL printed by Vite. Clerk shows its sign-in form when signed
out and the dengue dashboard when signed in. The publishable key is intended
for browser use; never put a Clerk secret key in this app.

The map uses country-level reports from the
[WHO Global Dengue Surveillance API](https://worldhealthorg.shinyapps.io/dengue_global/),
recent human dengue sequences from the
[NCBI GenBank Datasets API](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/data-packages/virus-genome/),
and Natural Earth 1:50m country boundaries. WHO data takes priority; GenBank
sequence data is used only when WHO has no serotype results for that country.
WHO does not provide state-level rows in this feed, so India is shown as one
country.

WHO serotype fields are presence flags, not case counts. The detailed view
shows the percentage of typed WHO reports that flag each type. If GenBank is
used as a fallback, percentages instead show the share of recent, dated human
sequence submissions assigned to each type. Sequence counts are not case
counts or population prevalence: they reflect uneven sequencing and
submission. Neither source supports reliable serotype values for every
country. Ties and countries with no usable source data remain neutral rather
than receiving estimated values.

The dashboard also includes a local symptom check-in. It can show a country's
available surveillance summary alongside general dengue symptom and urgent
warning-sign guidance. The optional city/area and symptom selections stay in
the current page and are not submitted or saved. Symptoms cannot identify a
dengue serotype, and this feature is not a diagnosis.
