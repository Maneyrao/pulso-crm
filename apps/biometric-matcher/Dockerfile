FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/ElTemplo.BiometricMatcher/ElTemplo.BiometricMatcher.csproj ./
RUN dotnet restore ElTemplo.BiometricMatcher.csproj
COPY src/ElTemplo.BiometricMatcher/ ./
RUN dotnet publish ElTemplo.BiometricMatcher.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENTRYPOINT ["dotnet", "ElTemplo.BiometricMatcher.dll"]
