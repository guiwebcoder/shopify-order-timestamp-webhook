import chalk from "chalk";

export function log(message, type = "info") {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "success":
      console.log(chalk.green(`[${timestamp}] ✅ ${message}`));
      break;
    case "error":
      console.error(chalk.red(`[${timestamp}] ❌ ${message}`));
      break;
    case "warn":
      console.warn(chalk.yellow(`[${timestamp}] ⚠️ ${message}`));
      break;
    default:
      console.log(chalk.cyan(`[${timestamp}] ℹ️ ${message}`));
  }
}
