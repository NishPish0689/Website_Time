# Simple Clerk sign in

1. Create a Clerk application and copy its publishable key.
2. Copy `.env.example` to `.env` and replace the sample value with your key.
3. Run `npm install`, then `npm run dev`.

Open the local URL printed by Vite. Clerk shows its sign-in form when signed
out and a sign-out button when signed in. The publishable key is intended for
browser use; never put a Clerk secret key in this app.
