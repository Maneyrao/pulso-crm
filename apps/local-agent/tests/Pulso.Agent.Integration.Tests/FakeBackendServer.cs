using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Pulso.Agent.Integration.Tests;

/// <summary>
/// Backend HTTP mínimo, in-process, para los flujos de integración (enroll/identify) descriptos
/// en API_CONTRACTS.md §10. Registra cada request para que los tests puedan verificar qué llegó
/// (base64 del template, branchId, etc.) sin depender de la API real de NestJS.
/// </summary>
public sealed class FakeBackendServer : IAsyncDisposable
{
    private WebApplication? _app;

    public string BaseUrl { get; private set; } = string.Empty;

    public ConcurrentBag<string> EnrollRequestBodies { get; } = [];
    public ConcurrentBag<string> IdentifyRequestBodies { get; } = [];
    public ConcurrentBag<string> HeartbeatRequestBodies { get; } = [];
    public ConcurrentBag<string> PairRequestBodies { get; } = [];

    /// <summary>Si se setea, el próximo enroll-complete devuelve este status en vez de 201.</summary>
    public int? NextEnrollStatusCode { get; set; }

    /// <summary>Si se setea, el próximo identify devuelve este status en vez de 200.</summary>
    public int? NextIdentifyStatusCode { get; set; }

    public async Task StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();

        var app = builder.Build();

        app.MapPost("/api/v1/agent/pair", async context =>
        {
            using var reader = new StreamReader(context.Request.Body);
            PairRequestBodies.Add(await reader.ReadToEndAsync());
            context.Response.StatusCode = 200;
            await context.Response.WriteAsJsonAsync(new { agentCredential = "fake-agent-credential", agentId = "agent-1" });
        });

        app.MapPost("/api/v1/agent/heartbeat", async context =>
        {
            using var reader = new StreamReader(context.Request.Body);
            HeartbeatRequestBodies.Add(await reader.ReadToEndAsync());
            await context.Response.WriteAsJsonAsync(new { status = "ACTIVE" });
        });

        app.MapPost("/api/v1/agent/events", async context =>
        {
            context.Response.StatusCode = 200;
            await context.Response.WriteAsJsonAsync(new { ok = true });
        });

        app.MapPost("/api/v1/agent/biometrics/enroll-complete", async context =>
        {
            using var reader = new StreamReader(context.Request.Body);
            EnrollRequestBodies.Add(await reader.ReadToEndAsync());

            context.Response.StatusCode = NextEnrollStatusCode ?? 201;
            NextEnrollStatusCode = null;
            await context.Response.WriteAsJsonAsync(new { ok = context.Response.StatusCode < 300 });
        });

        app.MapPost("/api/v1/agent/biometrics/identify", async context =>
        {
            using var reader = new StreamReader(context.Request.Body);
            IdentifyRequestBodies.Add(await reader.ReadToEndAsync());

            context.Response.StatusCode = NextIdentifyStatusCode ?? 200;
            NextIdentifyStatusCode = null;
            await context.Response.WriteAsJsonAsync(new { resolved = context.Response.StatusCode < 300 });
        });

        await app.StartAsync().ConfigureAwait(false);
        _app = app;

        var addressesFeature = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>();
        BaseUrl = addressesFeature!.Addresses.First();
    }

    public async ValueTask DisposeAsync()
    {
        var app = _app;
        _app = null;
        if (app is not null)
        {
            await app.StopAsync().ConfigureAwait(false);
            await app.DisposeAsync().ConfigureAwait(false);
        }
    }
}
