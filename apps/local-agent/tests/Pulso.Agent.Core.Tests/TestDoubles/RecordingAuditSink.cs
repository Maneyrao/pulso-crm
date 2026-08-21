using System.Collections.Concurrent;
using Pulso.Agent.Core.Ports;

namespace Pulso.Agent.Core.Tests.TestDoubles;

public sealed record AuditRecord(string Type, string Severity, string Message, IReadOnlyDictionary<string, string>? Metadata);

public sealed class RecordingAuditSink : IAgentAuditSink
{
    public ConcurrentQueue<AuditRecord> Records { get; } = new();

    public void Record(string type, string severity, string message, IReadOnlyDictionary<string, string>? metadata = null) =>
        Records.Enqueue(new AuditRecord(type, severity, message, metadata));
}
