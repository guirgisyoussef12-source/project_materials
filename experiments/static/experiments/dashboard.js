const $ = (id) => document.getElementById(id);

let chart;
let timer = null;
let running = false;
let elapsed = 0;
let readings = [];
let history = [];
let totalTests = 0;
let startTime = 0;
let nextSampleTime = 0;
let sampleRate = 100;
let duration = 10;
let damping = 0.4;
let frequency = 5;
let initialAmplitude = 4;
let noiseLevel = 0.035;

function initializeChart() {
    const ctx = $("vibration-chart").getContext("2d");

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Acceleration",
                data: [],
                borderColor: "#6258e8",
                backgroundColor: "rgba(98,88,232,0.08)",
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { intersect: false, mode: "index" },
            plugins: {
                legend: { display: false },
                tooltip: { displayColors: false }
            },
            scales: {
                x: {
                    title: { display: true, text: "Time (seconds)" },
                    ticks: { maxTicksLimit: 8, maxRotation: 0 },
                    grid: { color: "#f0f2f8" }
                },
                y: {
                    title: { display: true, text: "Acceleration (m/s²)" },
                    grid: { color: "#f0f2f8" }
                }
            }
        }
    });
}

function setStatus(status, detail) {
    $("test-status").textContent = status;
    $("status-detail").textContent = detail;
    $("chart-badge").textContent =
        status === "Running" ? "● RUNNING" :
        status === "Completed" ? "● COMPLETED" :
        status === "Stopped" ? "● STOPPED" : "● READY";
}

function configureSimulation() {
    const material = $("material-select").value;

    // Illustrative parameters only, not real material reference data.
    const parameters = {
        Aluminum: { damping: 0.25, frequency: 5.0 },
        Steel: { damping: 0.12, frequency: 6.0 },
        Copper: { damping: 0.20, frequency: 4.5 },
        Acrylic: { damping: 0.65, frequency: 3.0 },
        Unknown: { damping: 0.32, frequency: 4.0 }
    };

    const selected = parameters[material] || parameters.Unknown;
    damping = selected.damping;
    frequency = selected.frequency;
    duration = Number($("duration-select").value);
    sampleRate = Number($("sample-select").value);
    initialAmplitude = 4;
    noiseLevel = 0.035;
}

function startTest() {
    if (running) return;

    clearInterval(timer);
    configureSimulation();

    running = true;
    elapsed = 0;
    readings = [];
    startTime = performance.now();
    nextSampleTime = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update("none");

    $("chart-empty").classList.add("hidden");
    $("start-btn").disabled = true;
    $("stop-btn").disabled = false;
    $("material-select").disabled = true;
    $("duration-select").disabled = true;
    $("sample-select").disabled = true;

    $("peak-value").textContent = "0.00";
    $("decay-value").textContent = "—";
    $("elapsed-time").textContent = "0.00 s";
    $("data-points").textContent = "0";

    $("damping-ratio").textContent = "—";
    $("analysis-decay").textContent = "—";
    $("settling-time").textContent = "—";
    $("predicted-material").textContent = "Analyzing...";
    $("prediction-description").textContent = "Waiting for signal analysis.";
    $("confidence-value").textContent = "—";
    $("confidence-bar").style.width = "0%";
    $("interpretation").querySelector("p").textContent =
        "Collecting signal data. Results will appear when the test finishes.";

    setStatus("Running", "Collecting simulated readings");

    // Timer controls the animation, not the physical sampling frequency.
    timer = setInterval(generateSample, 1000 / Math.min(sampleRate, 50));
}

function generateSample() {
    if (!running) return;

    elapsed = (performance.now() - startTime) / 1000;

    if (elapsed >= duration) {
        elapsed = duration;
        finishTest("Completed");
        return;
    }

    while (nextSampleTime <= elapsed) {
        const t = nextSampleTime;
        const signal =
            initialAmplitude *
            Math.exp(-damping * t) *
            Math.cos(2 * Math.PI * frequency * t);

        const noise = (Math.random() * 2 - 1) * noiseLevel;
        const value = signal + noise;

        readings.push({ time: t, value });
        nextSampleTime += 1 / sampleRate;
    }

    // Keep the graph responsive while the simulation is running.
    const latest = readings[readings.length - 1];
    if (latest) {
        chart.data.labels.push(latest.time.toFixed(2));
        chart.data.datasets[0].data.push(latest.value);
    }

    // Keep the displayed history bounded for longer experiments.
    const maxVisible = 1500;
    if (chart.data.labels.length > maxVisible) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update("none");
    $("elapsed-time").textContent = `${elapsed.toFixed(2)} s`;
    $("data-points").textContent = readings.length;
    $("peak-value").textContent = readings.length
        ? Math.max(...readings.map(r => Math.abs(r.value))).toFixed(2)
        : "0.00";
}

function analyzeSignal() {
    if (readings.length < 10) return null;

    const peaks = [];

    // Detect local positive peaks.
    for (let i = 1; i < readings.length - 1; i++) {
        if (
            readings[i].value > readings[i - 1].value &&
            readings[i].value >= readings[i + 1].value &&
            readings[i].value > 0
        ) {
            peaks.push(readings[i]);
        }
    }

    // Estimate the exponential envelope decay from peak amplitudes.
    const usablePeaks = peaks.filter(p => p.value > 0.03);

    if (usablePeaks.length < 3) return null;

    const xs = usablePeaks.map(p => p.time);
    const ys = usablePeaks.map(p => Math.log(p.value));

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const numerator = xs.reduce(
        (sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0
    );
    const denominator = xs.reduce(
        (sum, x) => sum + (x - meanX) ** 2, 0
    );

    const decayRate = denominator ? -numerator / denominator : NaN;

    if (!Number.isFinite(decayRate) || decayRate <= 0) return null;

    // This is an estimate for the idealized underdamped oscillator model.
    const omega = 2 * Math.PI * frequency;
    const zeta = decayRate / Math.sqrt(omega ** 2 + decayRate ** 2);
    const settlingTime = 4 / decayRate;

    return { decayRate, zeta, settlingTime };
}

function predictDemoMaterial(metrics) {
    if (!metrics) {
        return {
            name: "Insufficient data",
            score: 0,
            description: "Not enough clean peaks to estimate decay."
        };
    }

    // Compare against the illustrative simulation parameters.
    // This is NOT a trained classifier and cannot identify real materials.
    const references = [
        { name: "Aluminum", decay: 0.25 },
        { name: "Steel", decay: 0.12 },
        { name: "Copper", decay: 0.20 },
        { name: "Acrylic", decay: 0.65 }
    ];

    const selected = $("material-select").value;
    const closest = references.reduce((best, candidate) =>
        Math.abs(candidate.decay - metrics.decayRate) <
        Math.abs(best.decay - metrics.decayRate) ? candidate : best
    );

    const distance = Math.abs(closest.decay - metrics.decayRate);
    const score = Math.max(0, Math.min(99, Math.round(
        100 * Math.exp(-distance / 0.3)
    )));

    return {
        name: selected === "Unknown" ? closest.name : selected,
        score,
        description: "Demo comparison with illustrative decay values."
    };
}

function finishTest(status = "Completed") {
    if (!running) return;

    running = false;
    clearInterval(timer);
    timer = null;

    $("start-btn").disabled = false;
    $("stop-btn").disabled = true;
    $("material-select").disabled = false;
    $("duration-select").disabled = false;
    $("sample-select").disabled = false;

    setStatus(status, status === "Completed" ?
        "Simulation finished" : "Test stopped manually");

    if (readings.length === 0) return;

    const metrics = analyzeSignal();

    if (metrics) {
        $("decay-value").textContent = metrics.decayRate.toFixed(3);
        $("analysis-decay").textContent = metrics.decayRate.toFixed(3);
        $("damping-ratio").textContent = metrics.zeta.toFixed(3);
        $("settling-time").textContent = metrics.settlingTime.toFixed(2);

        $("interpretation").querySelector("p").textContent =
            `Estimated exponential decay rate: ${metrics.decayRate.toFixed(3)} s⁻¹. ` +
            "Compare samples under identical test conditions before drawing conclusions.";

        const prediction = predictDemoMaterial(metrics);
        $("predicted-material").textContent = prediction.name;
        $("prediction-description").textContent = prediction.description;
        $("confidence-value").textContent = `${prediction.score}%`;
        $("confidence-bar").style.width = `${prediction.score}%`;
    } else {
        $("decay-value").textContent = "N/A";
        $("analysis-decay").textContent = "N/A";
        $("damping-ratio").textContent = "N/A";
        $("settling-time").textContent = "N/A";
        $("predicted-material").textContent = "Unavailable";
        $("prediction-description").textContent =
            "The signal did not contain enough usable peaks.";
        $("confidence-value").textContent = "—";
        $("confidence-bar").style.width = "0%";
    }

    saveHistory(metrics);
}

function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
}

async function saveHistory(metrics) {
    const peak = readings.length
        ? Math.max(...readings.map(r => Math.abs(r.value)))
        : 0;

    const material = $("material-select").value;
    const predicted = $("predicted-material").textContent;
    const confidence = parseFloat($("confidence-value").textContent);

    const payload = {
        material: material === "Unknown" ? null : material,
        source: "simulation",
        duration: Number(elapsed.toFixed(3)),
        sample_rate: sampleRate,
        readings: readings.map(r => [Number(r.time.toFixed(4)), Number(r.value.toFixed(5))]),
        metrics: {
            peak,
            decay_rate: metrics ? metrics.decayRate : null,
            damping_ratio: metrics ? metrics.zeta : null,
            settling_time: metrics ? metrics.settlingTime : null
        },
        predicted_material: predicted,
        confidence: Number.isFinite(confidence) ? confidence : null
    };

    try {
        const response = await fetch("/api/experiments/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken()
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        await loadHistory();
    } catch (error) {
        console.error("Could not save experiment:", error);
        alert("The experiment could not be saved to the database.");
    }
}

async function loadHistory() {
    try {
        const response = await fetch("/api/experiments/");
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        history = data.experiments.map(e => ({
            id: e.id,
            material: e.material,
            duration: Number(e.duration).toFixed(2),
            peak: e.peak == null ? "N/A" : Number(e.peak).toFixed(2),
            decay: e.decay == null ? "N/A" : Number(e.decay).toFixed(3),
            result: e.result
        }));
        totalTests = data.total;
        renderHistory();
    } catch (error) {
        console.error("Could not load history:", error);
    }
}

function renderHistory() {
    $("total-tests").textContent = totalTests;

    if (!history.length) return;

    const body = $("history-body");
    body.replaceChildren();

    history.forEach(item => {
        const row = document.createElement("tr");
        const values = [
            item.id, item.material, `${item.duration} s`,
            `${item.peak} m/s²`, item.decay, item.result
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            if (index === 5) {
                const badge = document.createElement("span");
                badge.className = "result-pill";
                badge.textContent = value;
                cell.appendChild(badge);
            } else {
                cell.textContent = value;
            }
            row.appendChild(cell);
        });

        body.appendChild(row);
    });
}

function resetTest() {
    running = false;
    clearInterval(timer);
    timer = null;
    elapsed = 0;
    readings = [];

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update("none");

    $("chart-empty").classList.remove("hidden");
    $("start-btn").disabled = false;
    $("stop-btn").disabled = true;
    $("material-select").disabled = false;
    $("duration-select").disabled = false;
    $("sample-select").disabled = false;

    $("peak-value").textContent = "0.00";
    $("decay-value").textContent = "—";
    $("elapsed-time").textContent = "0.00 s";
    $("data-points").textContent = "0";
    $("damping-ratio").textContent = "—";
    $("analysis-decay").textContent = "—";
    $("settling-time").textContent = "—";
    $("predicted-material").textContent = "Not available";
    $("prediction-description").textContent = "Complete a test to view the demo result.";
    $("confidence-value").textContent = "—";
    $("confidence-bar").style.width = "0%";
    $("interpretation").querySelector("p").textContent =
        "Run a test to calculate preliminary damping metrics from the simulated signal.";

    setStatus("Ready", "Waiting for a test");
}

function exportCSV() {
    if (!history.length) {
        alert("Run at least one test before exporting.");
        return;
    }

    const columns = ["Test ID", "Material", "Duration (s)",
        "Peak Amplitude (m/s²)", "Decay Rate (1/s)", "Prediction"];

    const escapeCSV = value =>
        `"${String(value).replace(/"/g, '""')}"`;

    const rows = history.map(item => [
        item.id, item.material, item.duration,
        item.peak, item.decay, item.result
    ]);

    const csv = [columns, ...rows]
        .map(row => row.map(escapeCSV).join(","))
        .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vibration-experiments.csv";
    link.click();
    URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
    initializeChart();

    $("current-date").textContent = new Date().toLocaleDateString(
        "en-GB", { day: "2-digit", month: "short", year: "numeric" }
    ).toUpperCase();

    loadHistory();

    $("start-btn").addEventListener("click", startTest);
    $("stop-btn").addEventListener("click", () => finishTest("Stopped"));
    $("reset-btn").addEventListener("click", resetTest);
    $("export-btn").addEventListener("click", exportCSV);
});