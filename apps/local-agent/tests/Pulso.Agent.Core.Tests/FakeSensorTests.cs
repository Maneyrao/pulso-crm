using Pulso.Agent.Sensors;
using Pulso.Agent.Sensors.FakeSensor;

namespace Pulso.Agent.Core.Tests;

public sealed class FakeSensorTests
{
    [Fact]
    public async Task Enrollment_and_identification_from_the_same_identity_produce_the_same_template()
    {
        var sensor = new FakeSensor(new FakeSensorOptions
        {
            Identity = "member-ana",
            CaptureLatency = TimeSpan.Zero,
        });

        var enrollmentSamples = new List<CaptureResult>();
        for (var i = 0; i < 4; i++)
        {
            enrollmentSamples.Add(await sensor.CaptureAsync("FAKE-0001", TimeSpan.FromSeconds(1), CancellationToken.None));
        }

        var identificationSample = await sensor.CaptureAsync("FAKE-0001", TimeSpan.FromSeconds(1), CancellationToken.None);
        var enrollment = await sensor.CreateTemplateAsync(enrollmentSamples, TemplateFormat.Iso19794_2, CancellationToken.None);
        var identification = await sensor.CreateTemplateAsync([identificationSample], TemplateFormat.Iso19794_2, CancellationToken.None);

        Assert.Equal(enrollment.TemplateData, identification.TemplateData);
    }

    [Fact]
    public async Task Different_simulated_identities_produce_different_templates()
    {
        var ana = new FakeSensor(new FakeSensorOptions { Identity = "member-ana", CaptureLatency = TimeSpan.Zero });
        var bruno = new FakeSensor(new FakeSensorOptions { Identity = "member-bruno", CaptureLatency = TimeSpan.Zero });

        var anaSample = await ana.CaptureAsync("FAKE-0001", TimeSpan.FromSeconds(1), CancellationToken.None);
        var brunoSample = await bruno.CaptureAsync("FAKE-0001", TimeSpan.FromSeconds(1), CancellationToken.None);
        var anaTemplate = await ana.CreateTemplateAsync([anaSample], TemplateFormat.Iso19794_2, CancellationToken.None);
        var brunoTemplate = await bruno.CreateTemplateAsync([brunoSample], TemplateFormat.Iso19794_2, CancellationToken.None);

        Assert.NotEqual(anaTemplate.TemplateData, brunoTemplate.TemplateData);
    }
}
