# Deploy Taylor Access to Cloudflare Pages and Railway
Write-Host "Building Angular..."
npm run build

Write-Host "Preparing deploy files..."
Copy-Item "dist\taylor-access\browser\index.html" "dist\taylor-access\browser\404.html" -Force
Set-Content "dist\taylor-access\browser\CNAME" "taylor-access.com"

Write-Host "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist/taylor-access/browser --project-name taylor-access-com --branch main --commit-dirty=true

Write-Host "Deploying API to Railway..."
Push-Location TaylorAccess.API
railway service taylor-access.com
railway up
Pop-Location

Write-Host "Done!"
