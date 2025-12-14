import chalk from 'chalk';
import inquirer from 'inquirer';
import * as config from './config';

/**
 * Reset configuration
 */
export async function resetConfig(): Promise<void> {
  if (!config.configExists()) {
    console.log(chalk.yellow('⚠ No configuration found.\n'));
    return;
  }

  console.log(chalk.red.bold('\n⚠️  Reset Configuration\n'));
  console.log(chalk.yellow('This will delete all configuration including:'));
  console.log(chalk.yellow('  - OpenAI API key'));
  console.log(chalk.yellow('  - All git user profiles'));
  console.log(chalk.yellow('  - Default user settings\n'));

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to reset all configuration?',
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('⚠ Reset cancelled.\n'));
    return;
  }

  const success = config.resetConfig();
  if (success) {
    console.log(chalk.green('✓ Configuration reset successfully.\n'));
    console.log(chalk.blue('Run "git-ai setup" to configure again.\n'));
  } else {
    console.log(chalk.red('❌ Failed to reset configuration.\n'));
  }
}

