# Taylor Access - API Gateway

Lightweight YARP reverse proxy that validates JWT tokens and forwards requests to the Taylor Access backend.

## Architecture

```
Frontend (Cloudflare) → Access API (this gateway) → Backend (taylor-access.com) → TA_DB
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Internal URL of the backend service |
| `JWT_SECRET_KEY` | JWT signing key (must match backend) |

## Local Development

```bash
cd TaylorAccess.Gateway
dotnet run
```
