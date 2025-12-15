import chalk from 'chalk';
import { execSync } from 'child_process';
import packageJson from '../package.json';
import { getErrorMessage } from './utils/errors';

/**
 * Check for updates and update the package
 */
export async function checkAndUpdate(): Promise<void> {
  console.log(chalk.blue.bold('\n🔄 Checking for updates...\n'));

  try {
    // Check latest version from npm
    const latestVersion = execSync(
      `npm view @mehmetsagir/git-ai version`,
      { encoding: 'utf-8' }
    ).trim();

    const currentVersion = packageJson.version;

    if (latestVersion === currentVersion) {
      console.log(chalk.green(`✓ You are using the latest version (${currentVersion})\n`));
      return;
    }

    console.log(chalk.yellow(`Current version: ${currentVersion}`));
    console.log(chalk.yellow(`Latest version: ${latestVersion}\n`));

    // Automatically update when --update flag is used (no confirmation needed)
    console.log(chalk.blue('📦 Updating package...\n'));

    try {
      // Update globally installed package
      execSync('npm install -g @mehmetsagir/git-ai@latest', {
        stdio: 'inherit'
      });
      console.log(chalk.green(`\n✓ Successfully updated to version ${latestVersion}!\n`));
    } catch (error) {
      console.log(chalk.red('\n❌ Update failed. Please run manually:\n'));
      console.log(chalk.cyan('  npm install -g @mehmetsagir/git-ai@latest\n'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Error checking for updates: ${getErrorMessage(error)}\n`));
    console.log(chalk.yellow('You can manually update with:\n'));
    console.log(chalk.cyan('  npm install -g @mehmetsagir/git-ai@latest\n'));
  }
}

/**
 * Check for updates silently (for update-notifier)
 */
export function checkForUpdates(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updateNotifier = require('update-notifier');
    const notifier = updateNotifier({
      pkg: packageJson,
      updateCheckInterval: 1000 * 60 * 60 * 24
    });

    if (notifier.update) {
      notifier.notify({
        message: `Update available: ${notifier.update.current} → ${notifier.update.latest}\nRun 'git-ai --update' to update.`
      });
    }
  } catch {
    // Silently fail if update-notifier is not available
  }
}

