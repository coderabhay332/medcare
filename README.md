# MediSafe - Drug Safety Checker

## Start the Project

Install dependencies if needed:

```powershell
pnpm install
```

Start the API server in one terminal:

```powershell
pnpm --filter @workspace/api-server dev
```

Start the web app in another terminal:

```powershell
pnpm --filter @workspace/medisafe-web dev
```

Open the app at:

```text
http://localhost:5173
```

The frontend proxies API requests to `http://localhost:8080`, so make sure `.env` has:

```env
PORT=8080
```
