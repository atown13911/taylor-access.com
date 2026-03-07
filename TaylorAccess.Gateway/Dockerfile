FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["TaylorAccess.Gateway/TaylorAccess.Gateway.csproj", "TaylorAccess.Gateway/"]
RUN dotnet restore "TaylorAccess.Gateway/TaylorAccess.Gateway.csproj"
COPY . .
WORKDIR "/src/TaylorAccess.Gateway"
RUN dotnet build "TaylorAccess.Gateway.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "TaylorAccess.Gateway.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENTRYPOINT ["dotnet", "TaylorAccess.Gateway.dll"]
