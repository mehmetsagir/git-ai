import chalk from 'chalk';
import inquirer from 'inquirer';
import * as config from './config';
import * as userManagement from './user-management';

/**
 * Add a new git user
 */
export async function addUser(): Promise<void> {
  console.log(chalk.blue.bold('\n➕ Add Git User\n'));

  if (!config.configExists()) {
    console.log(chalk.yellow('⚠ Configuration not found. Please run setup first.\n'));
    console.log(chalk.blue('Run: git-ai setup\n'));
    return;
  }

  const existingProfiles = config.getGitUsers();
  
  if (existingProfiles.length > 0) {
    console.log(chalk.blue('Current git user profiles:\n'));
    existingProfiles.forEach((profile, index) => {
      const shortcutInfo = profile.shortcut 
        ? chalk.yellow(` [shortcut: ${profile.shortcut}]`)
        : '';
      console.log(chalk.cyan(`  ${index + 1}. ${profile.label}${shortcutInfo}`));
    });
    console.log('\n');
  }

  console.log(chalk.blue('💡 Tip: Type "q" and press Enter at any input to cancel.\n'));

  await userManagement.addMoreGitUsers(existingProfiles);

  const updatedProfiles = config.getGitUsers();
  if (updatedProfiles.length > 1) {
    const { updateDefault } = await inquirer.prompt<{ updateDefault: boolean }>([
      {
        type: 'confirm',
        name: 'updateDefault',
        message: 'Would you like to update the default git user?',
        default: false
      }
    ]);

    if (updateDefault) {
      const { defaultUser } = await inquirer.prompt<{ defaultUser: string }>([
        {
          type: 'list',
          name: 'defaultUser',
          message: 'Select default git user:',
          choices: updatedProfiles.map(p => ({
            name: p.label,
            value: p.id
          }))
        }
      ]);

      config.setDefaultGitUser(defaultUser);
      const selectedProfile = updatedProfiles.find(p => p.id === defaultUser);
      if (selectedProfile) {
        console.log(chalk.green(`✓ Default git user updated: ${selectedProfile.label}\n`));
      }
    }
  }

  console.log(chalk.green('✓ User addition completed!\n'));
}

