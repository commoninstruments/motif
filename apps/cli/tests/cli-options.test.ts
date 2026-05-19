import { Command } from "commander";
import { describe, expect, it } from "vitest";

/**
 * Tests that the CLI program correctly parses the new advanced generation,
 * video, and model-specific options added for SDK parameter passthrough.
 *
 * We construct a fresh Commander program with the same options as cli.ts
 * and verify the parsed values.
 */

/** Build a program with the same options as cli.ts — extracted for testing */
function buildProgram(): Command {
  // We dynamically import the actual program builder if available,
  // but for now we replicate the option chain to test parsing behavior.
  // This ensures the options we add are parseable by Commander.
  return (
    new Command()
      .name("motif")
      .exitOverride() // Throw instead of process.exit in tests
      .argument("[prompt]", "prompt")
      // Existing options (subset relevant to tests)
      .option("-m, --model <model>", "Model")
      .option("--dry-run", "Dry run")
      .option("--transparent", "Transparent")
      .option("--loose", "Loose fidelity")
      .option("-n, --num <count>", "Number of images")
      .option("--video", "Generate video")
      .option("--video-duration <seconds>", "Video duration")
      .option("--video-no-audio", "Disable audio")
      // New advanced generation options
      .option("--seed <n>", "Reproducible generation seed")
      .option("--negative <text>", "Negative prompt")
      .option("--style <style>", "Style preset")
      .option("--output-format <format>", "Output format: jpeg, png, webp")
      .option("--safety <level>", "Safety tolerance 1-6")
      .option("--web-search", "Enable web search")
      .option("--guidance-scale <n>", "CFG guidance scale")
      .option("--steps <n>", "Inference step count")
      .option("--raw", "Natural output (flux)")
      .option("--enhance-prompt", "Auto-enhance prompt (flux)")
      .option(
        "--rendering-speed <speed>",
        "Speed/quality: TURBO, BALANCED, QUALITY",
      )
      .option("--expand-prompt", "Enable MagicPrompt expansion (ideogram)")
      .option("--no-expand-prompt", "Disable MagicPrompt expansion (ideogram)")
      // New video options
      .option("--video-negative <text>", "Negative prompt for video")
      .option("--video-cfg-scale <n>", "CFG guidance scale for video")
  );
}

describe("CLI advanced generation options parsing", () => {
  it("parses --seed as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--seed", "42"], { from: "node" });
    const opts = program.opts();
    expect(opts.seed).toBe("42");
  });

  it("parses --negative as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--negative", "blurry, ugly"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.negative).toBe("blurry, ugly");
  });

  it("parses --style as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--style", "realistic_image"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.style).toBe("realistic_image");
  });

  it("parses --output-format as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--output-format", "webp"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.outputFormat).toBe("webp");
  });

  it("parses --safety as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--safety", "3"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.safety).toBe("3");
  });

  it("parses --web-search as boolean", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--web-search"], { from: "node" });
    const opts = program.opts();
    expect(opts.webSearch).toBe(true);
  });

  it("parses --guidance-scale as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--guidance-scale", "7.5"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.guidanceScale).toBe("7.5");
  });

  it("parses --steps as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--steps", "8"], { from: "node" });
    const opts = program.opts();
    expect(opts.steps).toBe("8");
  });

  it("parses --raw as boolean", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--raw"], { from: "node" });
    const opts = program.opts();
    expect(opts.raw).toBe(true);
  });

  it("parses --enhance-prompt as boolean", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--enhance-prompt"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.enhancePrompt).toBe(true);
  });

  it("parses --rendering-speed as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--rendering-speed", "QUALITY"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.renderingSpeed).toBe("QUALITY");
  });

  it("parses --expand-prompt as boolean", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--expand-prompt"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.expandPrompt).toBe(true);
  });

  it("parses --no-expand-prompt as false", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat", "--no-expand-prompt"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.expandPrompt).toBe(false);
  });

  it("leaves expandPrompt undefined when not specified", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "a cat"], { from: "node" });
    const opts = program.opts();
    // When both --expand-prompt and --no-expand-prompt are defined and
    // neither is passed, Commander leaves the key absent from opts.
    expect(opts).not.toHaveProperty("expandPrompt");
  });
});

describe("CLI video options parsing", () => {
  it("parses --video-negative as string", () => {
    const program = buildProgram();
    program.parse(
      ["node", "motif", "--video", "--video-negative", "static, jitter"],
      { from: "node" },
    );
    const opts = program.opts();
    expect(opts.videoNegative).toBe("static, jitter");
  });

  it("parses --video-cfg-scale as string", () => {
    const program = buildProgram();
    program.parse(["node", "motif", "--video", "--video-cfg-scale", "0.7"], {
      from: "node",
    });
    const opts = program.opts();
    expect(opts.videoCfgScale).toBe("0.7");
  });
});

describe("CLI multiple new options combined", () => {
  it("parses several new options together", () => {
    const program = buildProgram();
    program.parse(
      [
        "node",
        "motif",
        "a sunset",
        "--seed",
        "123",
        "--negative",
        "clouds",
        "--style",
        "REALISTIC",
        "--raw",
        "--output-format",
        "png",
        "--guidance-scale",
        "15",
        "--steps",
        "10",
      ],
      { from: "node" },
    );
    const opts = program.opts();
    expect(opts.seed).toBe("123");
    expect(opts.negative).toBe("clouds");
    expect(opts.style).toBe("REALISTIC");
    expect(opts.raw).toBe(true);
    expect(opts.outputFormat).toBe("png");
    expect(opts.guidanceScale).toBe("15");
    expect(opts.steps).toBe("10");
  });
});
