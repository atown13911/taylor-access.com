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
# BuildKit requires ARG before ENV references; Railway injects PORT at runtime (see Program.cs).
ARG PORT=8080
ENV ASPNETCORE_URLS=http://0.0.0.0:${PORT}
EXPOSE 8080
ENTRYPOINT ["dotnet", "TaylorAccess.API.dll"]
