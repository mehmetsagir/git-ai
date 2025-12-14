import inquirer from 'inquirer';
import chalk from 'chalk';
import * as config from './config';
import * as git from './git';
import * as userManagement from './user-management';
import { GitUserProfile } from './types';
import { validateOpenAIKey, validateUserName, validateUserEmail, isCancellation } from './utils/validation';
import { getErrorMessage } from './utils/errors';

/**
 * Run setup command
 */
export async function runSetup(): Promise<void> {
  console.log(chalk.blue.bold('\n🔧 Git Commit AI Setup\n'));

  const { openaiKey } = await inquirer.prompt<{ openaiKey: string }>([
    {
      type: 'password',
      name: 'openaiKey',
      message: 'Enter OpenAI API Key:',
      validate: validateOpenAIKey
    }
  ]);

  config.setOpenAIKey(openaiKey);
  console.log(chalk.green('✓ OpenAI API Key saved\n'));

  console.log(chalk.blue('Detecting git user profiles...\n'));
  let gitProfiles: GitUserProfile[] = [];

  try {
    gitProfiles = await git.getAllGitUserProfiles();
  } catch (error) {
    console.log(chalk.yellow(`⚠ Could not get git user profiles: ${getErrorMessage(error)}`));
  }

  if (gitProfiles.length === 0) {
    try {
      const currentUser = await git.getGitUserInfo();
      if (currentUser.name && currentUser.email) {
        gitProfiles.push({
          id: `current-${currentUser.email}`,
          name: currentUser.name,
          email: currentUser.email,
          scope: 'current',
          label: `${currentUser.name} <${currentUser.email}> (Current)`
        });
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠ Could not get current git user info: ${getErrorMessage(error)}`));
    }
  }

  if (gitProfiles.length === 0) {
    const { addManual } = await inquirer.prompt<{ addManual: boolean }>([
      {
        type: 'confirm',
        name: 'addManual',
        message: 'No git user profile found. Would you like to add one manually?',
        default: true
      }
    ]);

    if (addManual) {
      console.log(chalk.blue('💡 Tip: Type "q" and press Enter at any input to cancel.\n'));
      const { name, email } = await inquirer.prompt<{ name: string; email: string }>([
        {
          type: 'input',
          name: 'name',
          message: 'Git user name (or "q" to cancel):',
          validate: validateUserName
        },
        {
          type: 'input',
          name: 'email',
          message: 'Git user email (or "q" to cancel):',
          validate: (input: string) => validateUserEmail(input, [])
        }
      ]);

      if (isCancellation(name) || isCancellation(email)) {
        console.log(chalk.yellow('⚠ Manual user addition cancelled.\n'));
      } else {
        gitProfiles.push({
          id: `manual-${email}`,
          name,
          email,
          scope: 'manual',
          label: `${name} <${email}> (Manual)`
        });
      }
    }
  }

  if (gitProfiles.length > 0) {
    gitProfiles = await userManagement.addShortcutsToProfiles(gitProfiles);

    config.setGitUsers(gitProfiles);
    console.log(chalk.green(`✓ Found ${gitProfiles.length} active git user profiles\n`));

    console.log(chalk.blue('📋 Active Git User Profiles:\n'));
    gitProfiles.forEach((profile, index) => {
      const shortcutInfo = profile.shortcut
        ? chalk.yellow(` [shortcut: ${profile.shortcut}]`)
        : '';
      console.log(chalk.cyan(`  ${index + 1}. ${profile.label}${shortcutInfo}`));
    });
    console.log('\n');

    if (gitProfiles.length === 1) {
      config.setDefaultGitUser(gitProfiles[0].id);
      console.log(chalk.green(`✓ Set as default git user: ${gitProfiles[0].label}\n`));
    } else {
      const { defaultUser } = await inquirer.prompt<{ defaultUser: string }>([
        {
          type: 'list',
          name: 'defaultUser',
          message: 'Select default git user:',
          choices: gitProfiles.map(p => ({
            name: p.label,
            value: p.id
          }))
        }
      ]);

      config.setDefaultGitUser(defaultUser);
      const selectedProfile = gitProfiles.find(p => p.id === defaultUser);
      if (selectedProfile) {
        console.log(chalk.green(`✓ Set as default git user: ${selectedProfile.label}\n`));
      }
    }
  } else {
    console.log(chalk.yellow('⚠ No git user profile found.\n'));
  }

  const { addMore } = await inquirer.prompt<{ addMore: boolean }>([
    {
      type: 'confirm',
      name: 'addMore',
      message: 'Would you like to add more git user profiles?',
      default: false
    }
  ]);

  if (addMore) {
    console.log(chalk.blue('\n💡 Tip: Type "q" and press Enter at any input to cancel adding users.\n'));
    await userManagement.addMoreGitUsers(gitProfiles);

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
  }

  console.log(chalk.green.bold('✓ Setup completed!\n'));
  console.log(chalk.blue('Usage: git-ai commit\n'));
}

