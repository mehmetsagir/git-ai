import chalk from 'chalk';
import inquirer from 'inquirer';
import * as config from './config';

/**
 * List all git users
 */
export function listUsers(): void {
  const users = config.getGitUsers();
  const defaultUserId = config.getDefaultGitUser();

  if (users.length === 0) {
    console.log(chalk.yellow('⚠ No git user profiles found.\n'));
    console.log(chalk.blue('Run "git-ai setup" to add users.\n'));
    return;
  }

  console.log(chalk.blue.bold(`\n📋 Git User Profiles (${users.length} total)\n`));

  users.forEach((user, index) => {
    const isDefault = user.id === defaultUserId;
    const defaultBadge = isDefault ? chalk.green(' [DEFAULT]') : '';
    const shortcutInfo = user.shortcut
      ? chalk.yellow(` [shortcut: ${user.shortcut}]`)
      : chalk.gray(' [no shortcut]');

    console.log(chalk.cyan(`${index + 1}. ${user.label}${defaultBadge}${shortcutInfo}`));
    console.log(chalk.gray(`   ID: ${user.id}`));
    console.log(chalk.gray(`   Scope: ${user.scope}`));
    console.log('');
  });

  if (defaultUserId) {
    const defaultUser = users.find(u => u.id === defaultUserId);
    if (defaultUser) {
      console.log(chalk.green(`✓ Default user: ${defaultUser.label}\n`));
    }
  } else {
    console.log(chalk.yellow('⚠ No default user set.\n'));
  }
}

/**
 * Remove a git user interactively
 */
export async function removeUser(): Promise<void> {
  const users = config.getGitUsers();

  if (users.length === 0) {
    console.log(chalk.yellow('⚠ No git user profiles found.\n'));
    console.log(chalk.blue('Run "git-ai setup" to add users.\n'));
    return;
  }

  console.log(chalk.blue.bold('\n🗑️  Remove Git User\n'));

  const { userToRemove } = await inquirer.prompt<{ userToRemove: string }>([
    {
      type: 'list',
      name: 'userToRemove',
      message: 'Select user to remove:',
      choices: users.map(u => ({
        name: `${u.label}${u.shortcut ? ` [shortcut: ${u.shortcut}]` : ''}`,
        value: u.id
      }))
    }
  ]);

  const user = users.find(u => u.id === userToRemove);
  if (!user) {
    console.log(chalk.red('❌ User not found.\n'));
    return;
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove ${user.label}?`,
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('⚠ Removal cancelled.\n'));
    return;
  }

  const success = config.removeGitUser(userToRemove);
  if (success) {
    console.log(chalk.green(`✓ User removed: ${user.label}\n`));

    const remainingUsers = config.getGitUsers();
    if (remainingUsers.length > 0 && config.getDefaultGitUser() === null) {
      console.log(chalk.yellow('⚠ Default user was removed. Consider setting a new default.\n'));
      console.log(chalk.blue('Run "git-ai setup" to update default user.\n'));
    }
  } else {
    console.log(chalk.red('❌ Failed to remove user.\n'));
  }
}
