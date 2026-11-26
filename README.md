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
[WHO Global Dengue Surveillance API](https://worldhealthorg.shinyapps.io/dengue_global/)
and Natural Earth 1:50m country boundaries. It loads the full available WHO
report history and shows each country's latest valid case-count report. The
reported date is shown with the count because countries may have different,
older reporting dates. WHO does not provide state-level rows in this feed, so
India is shown as one country.

WHO serotype fields are presence flags, not case counts. The detailed view
shows the percentage of typed WHO reports from the last two years that flag
each type. Serotype values are optional: missing or tied values remain
unreported/neutral and are never estimated. NCBI GenBank is not used as a
fallback.

The dashboard also includes a local symptom check-in. It can show a country's
available surveillance summary alongside general dengue symptom and urgent
warning-sign guidance. The optional city/area and symptom selections stay in
the current page and are not submitted or saved. Symptoms cannot identify a
dengue serotype, and this feature is not a diagnosis.
