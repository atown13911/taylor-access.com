FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY TaylorAccess.API/TaylorAccess.API.csproj TaylorAccess.API/
RUN dotnet restore TaylorAccess.API/TaylorAccess.API.csproj
COPY TaylorAccess.API/ TaylorAccess.API/
WORKDIR /src/TaylorAccess.API
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
# Railway assigns PORT at runtime — must not bake ASPNETCORE_URLS at image build time.
ENTRYPOINT ["sh", "-c", "export ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080}; exec dotnet TaylorAccess.API.dll"]
