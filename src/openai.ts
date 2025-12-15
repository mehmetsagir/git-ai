import OpenAI from 'openai';
import * as prompts from './prompts';
import { AnalysisResult } from './types';
import { getErrorMessage } from './utils/errors';

let openaiClient: OpenAI | null = null;

/**
 * Initialize OpenAI client
 */
export function initOpenAI(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Get OpenAI client
 */
export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Call initOpenAI() first.');
  }
  return openaiClient;
}

/**
 * Analyze git diff and create commit groups
 */
export async function analyzeDiffAndGroup(diff: string, apiKey: string): Promise<AnalysisResult> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  initOpenAI(apiKey);
  const client = getOpenAIClient();

  const systemPrompt = prompts.getDiffAnalysisSystemPrompt();
  const userPrompt = prompts.getDiffAnalysisUserPrompt(diff);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    const result = JSON.parse(content) as AnalysisResult;
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('API key')) {
      throw new Error('Invalid OpenAI API key');
    }
    throw new Error(`OpenAI API error: ${message}`);
  }
}

/**
 * Generate commit message for a single diff (simple usage)
 */
export async function generateCommitMessage(diff: string, apiKey: string): Promise<{ commitMessage: string; commitBody: string }> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  initOpenAI(apiKey);
  const client = getOpenAIClient();

  const systemPrompt = prompts.getSingleCommitSystemPrompt();
  const userPrompt = prompts.getSingleCommitUserPrompt(diff);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    const result = JSON.parse(content) as { commitMessage: string; commitBody: string };
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('API key')) {
      throw new Error('Invalid OpenAI API key');
    }
    throw new Error(`OpenAI API error: ${message}`);
  }
}

/**
 * Generate changes summary from git diff
 */
export async function generateChangesSummary(
  diff: string,
  apiKey: string
): Promise<{ summary: string }> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  initOpenAI(apiKey);
  const client = getOpenAIClient();

  const systemPrompt = prompts.getChangesSummarySystemPrompt();
  const userPrompt = prompts.getChangesSummaryUserPrompt(diff);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }
    const result = JSON.parse(content) as { summary: string };
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('API key')) {
      throw new Error('Invalid OpenAI API key');
    }
    throw new Error(`OpenAI API error: ${message}`);
  }
}

