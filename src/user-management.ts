import inquirer from 'inquirer';
import chalk from 'chalk';
import * as config from './config';
import { GitUserProfile } from './types';
import { validateShortcut, validateUserName, validateUserEmail, isCancellation } from './utils/validation';

/**
 * Add shortcuts to each user profile
 */
export async function addShortcutsToProfiles(profiles: GitUserProfile[]): Promise<GitUserProfile[]> {
  const updatedProfiles: GitUserProfile[] = [];
  const usedShortcuts = new Set<string>();

  for (const profile of profiles) {
    const { addShortcut } = await inquirer.prompt<{ addShortcut: boolean }>([
      {
        type: 'confirm',
        name: 'addShortcut',
        message: `Would you like to add a shortcut for ${profile.label}?`,
        default: true
      }
    ]);

    let shortcut: string | null = null;
    if (addShortcut) {
      const { shortcutKey } = await inquirer.prompt<{ shortcutKey: string }>([
        {
          type: 'input',
          name: 'shortcutKey',
          message: 'Enter shortcut key (e.g., g, my, work, personal) or "q" to skip:',
          validate: (input: string) => validateShortcut(input, usedShortcuts)
        }
      ]);

      if (!isCancellation(shortcutKey)) {
        shortcut = shortcutKey.trim().toLowerCase();
        usedShortcuts.add(shortcut);
        console.log(chalk.green(`✓ Shortcut added: ${shortcut} → ${profile.label}\n`));
      }
    }

    updatedProfiles.push({
      ...profile,
      shortcut
    });
  }

  return updatedProfiles;
}

/**
 * Add more git user profiles
 */
export async function addMoreGitUsers(existingProfiles: GitUserProfile[]): Promise<GitUserProfile[]> {
  const newProfiles: GitUserProfile[] = [...existingProfiles];
  const usedShortcuts = new Set<string>(newProfiles.map(p => p.shortcut).filter((s): s is string => Boolean(s)));

  while (true) {
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
        validate: (input: string) => validateUserEmail(input, newProfiles.map(p => p.email))
      }
    ]);

    if (isCancellation(name) || isCancellation(email)) {
      config.setGitUsers(newProfiles);
      console.log(chalk.yellow('⚠ User addition cancelled. Continuing with setup...\n'));
      break;
    }

    if (newProfiles.some(p => p.email === email)) {
      const { continueAnyway } = await inquirer.prompt<{ continueAnyway: boolean }>([
        {
          type: 'confirm',
          name: 'continueAnyway',
          message: 'This user already exists. Would you like to continue anyway?',
          default: false
        }
      ]);

      if (!continueAnyway) {
        config.setGitUsers(newProfiles);
        console.log(chalk.yellow('⚠ User addition cancelled. Continuing with setup...\n'));
        break;
      }
    }

    const newProfile: GitUserProfile = {
      id: `manual-${Date.now()}-${email}`,
      name,
      email,
      scope: 'manual',
      label: `${name} <${email}> (Manual)`,
      shortcut: null
    };

    const { addShortcut } = await inquirer.prompt<{ addShortcut: boolean }>([
      {
        type: 'confirm',
        name: 'addShortcut',
        message: `Would you like to add a shortcut for ${newProfile.label}?`,
        default: true
      }
    ]);

    if (addShortcut) {
      const { shortcutKey } = await inquirer.prompt<{ shortcutKey: string }>([
        {
          type: 'input',
          name: 'shortcutKey',
          message: 'Enter shortcut key (e.g., g, my, work, personal) or "q" to skip:',
          validate: (input: string) => validateShortcut(input, usedShortcuts)
        }
      ]);

      if (!isCancellation(shortcutKey)) {
        newProfile.shortcut = shortcutKey.trim().toLowerCase();
        usedShortcuts.add(newProfile.shortcut);
      }
    }

    newProfiles.push(newProfile);

    const shortcutInfo = newProfile.shortcut
      ? chalk.yellow(` [shortcut: ${newProfile.shortcut}]`)
      : '';
    console.log(chalk.green(`✓ Profile added: ${name} <${email}>${shortcutInfo}\n`));

    const { more } = await inquirer.prompt<{ more: boolean }>([
      {
        type: 'confirm',
        name: 'more',
        message: 'Would you like to add another profile?',
        default: false
      }
    ]);

    if (!more) {
      break;
    }
  }

  config.setGitUsers(newProfiles);
  console.log(chalk.green(`✓ Total ${newProfiles.length} git user profiles saved\n`));

  return newProfiles;
}
