using Pulso.Agent.Core.Ports;

namespace Pulso.Agent.Core.Tests.TestDoubles;

/// <summary>Doble de IBiometricBackendClient configurable para éxito, rechazo o inalcanzable.</summary>
public sealed class StubBackendClient : IBiometricBackendClient
{
    public bool EnrollOk { get; set; } = true;
    public bool IdentifyResolved { get; set; } = true;
    public Exception? ThrowOnEnroll { get; set; }
    public Exception? ThrowOnIdentify { get; set; }

    public List<EnrollCompleteRequest> EnrollRequests { get; } = [];
    public List<IdentifyRequest> IdentifyRequests { get; } = [];

    public Task<EnrollCompleteResult> CompleteEnrollAsync(string deviceToken, EnrollCompleteRequest request, CancellationToken ct)
    {
        EnrollRequests.Add(request);
        if (ThrowOnEnroll is not null)
        {
            throw ThrowOnEnroll;
        }

        return Task.FromResult(new EnrollCompleteResult { Ok = EnrollOk });
    }

    public Task<IdentifyResult> SubmitIdentifyAsync(string deviceToken, IdentifyRequest request, CancellationToken ct)
    {
        IdentifyRequests.Add(request);
        if (ThrowOnIdentify is not null)
        {
            throw ThrowOnIdentify;
        }

        return Task.FromResult(new IdentifyResult { Resolved = IdentifyResolved });
    }
}
