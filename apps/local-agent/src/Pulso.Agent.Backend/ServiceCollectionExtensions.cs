using Microsoft.Extensions.DependencyInjection;
using Polly;
using Polly.Extensions.Http;
using Pulso.Agent.Core.Ports;

namespace Pulso.Agent.Backend;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registra BackendClient con timeout de 10s y 3 reintentos con backoff exponencial
    /// (LOCAL_AGENT_ARCHITECTURE.md §7-§8), más ConfigStore/AuditBuffer/HeartbeatService.
    /// <paramref name="retryBaseDelay"/> escala el backoff (default 1s → 2s/4s/8s); los tests de
    /// integración lo bajan a milisegundos para ejercitar los 3 reintentos sin esperar ~14s reales.
    /// </summary>
    public static IServiceCollection AddPulsoAgentBackend(
        this IServiceCollection services, string backendBaseUrl, TimeSpan? retryBaseDelay = null)
    {
        services.AddHttpClient<BackendClient>(client =>
            {
                client.BaseAddress = new Uri(backendBaseUrl);
                client.Timeout = TimeSpan.FromSeconds(10);
            })
            .AddPolicyHandler(GetRetryPolicy(retryBaseDelay ?? TimeSpan.FromSeconds(1)));

        services.AddSingleton<IBiometricBackendClient>(sp => sp.GetRequiredService<BackendClient>());
        services.AddSingleton<AuditBuffer>();
        services.AddSingleton<IAgentAuditSink>(sp => sp.GetRequiredService<AuditBuffer>());
        services.AddHostedService(sp => sp.GetRequiredService<AuditBuffer>());
        services.AddHostedService<HeartbeatService>();

        return services;
    }

    private static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy(TimeSpan baseDelay) =>
        HttpPolicyExtensions
            .HandleTransientHttpError() // 5xx y 408
            .OrResult(msg => (int)msg.StatusCode == 429)
            .WaitAndRetryAsync(3, attempt => baseDelay * Math.Pow(2, attempt));
}
