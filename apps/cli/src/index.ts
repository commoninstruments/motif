import { render } from "ink";
import React from "react";

import { setApiKey } from "./api/fal";
import { runCli } from "./cli";
import { runSeries } from "./commands/series";
import { runTools } from "./commands/tools";
import { App } from "./studio/app";
import { getApiKey, loadConfig, loadHistory, saveConfig } from "./utils/config";
import type { MotifConfig } from "./utils/config";

async function main() {
  // Load config and set API key
  const config = await loadConfig();
  try {
    const apiKey = getApiKey(config);
    setApiKey(apiKey);
  } catch {
    // API key will be checked when needed
  }

  const args = process.argv.slice(2);

  // Route to series subcommand
  if (args[0] === "series") {
    await runSeries(args.slice(1));
    return;
  }

  // Route to fal utility tools subcommand
  if (args[0] === "tool" || args[0] === "tools") {
    await runTools(args.slice(1));
    return;
  }

  // Launch terminal Studio only when explicitly requested.
  if (args[0] === "studio") {
    await launchStudio();
    return;
  }

  await runCli(["node", "motif", ...args], config);
}

async function launchStudio() {
  let config = await loadConfig();
  let history = await loadHistory();

  const handleConfigChange = async (newConfig: Partial<MotifConfig>) => {
    await saveConfig(newConfig);
    config = { ...config, ...newConfig };
  };

  const handleHistoryChange = async () => {
    history = await loadHistory();
    // Re-render with new history
    rerender(
      React.createElement(App, {
        config,
        history,
        onConfigChange: handleConfigChange,
        onHistoryChange: handleHistoryChange,
      })
    );
  };

  const { rerender, waitUntilExit } = render(
    React.createElement(App, {
      config,
      history,
      onConfigChange: handleConfigChange,
      onHistoryChange: handleHistoryChange,
    })
  );

  await waitUntilExit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
