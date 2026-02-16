import type { Model, RouterConfig, RouterStrategy } from '../types/index.js';

/**
 * ModelRouter — intelligent model selection based on task characteristics.
 *
 * Routes requests to the appropriate model (complex/standard/simple) based on:
 * - Input length and complexity signals
 * - Budget constraints
 * - Custom routing functions
 *
 * ```ts
 * const router = new ModelRouter({
 *   strategy: 'cost-optimized',
 *   models: {
 *     complex: anthropic('claude-opus-4-6'),
 *     standard: anthropic('claude-sonnet-4-5'),
 *     simple: anthropic('claude-haiku-4-5'),
 *   },
 * });
 *
 * const model = router.select('Analyze this complex architecture...');
 * // → returns the opus model for complex inputs
 * ```
 */
export class ModelRouter {
  readonly strategy: RouterStrategy;
  readonly models: { complex: Model; standard: Model; simple: Model };
  private customRoute?: (input: string, context?: string) => 'complex' | 'standard' | 'simple';
  private dailySpend = 0;
  private dailyResetDate = new Date().toDateString();
  private budgetMaxPerRun?: number;
  private budgetMaxPerDay?: number;

  constructor(config: RouterConfig) {
    this.strategy = config.strategy;
    this.models = config.models;
    this.customRoute = config.route;
    this.budgetMaxPerRun = config.budget?.maxPerRun;
    this.budgetMaxPerDay = config.budget?.maxPerDay;
  }

  /**
   * Select the best model for the given input.
   */
  select(input: string, context?: string): Model {
    // Reset daily spend if new day
    const today = new Date().toDateString();
    if (today !== this.dailyResetDate) {
      this.dailySpend = 0;
      this.dailyResetDate = today;
    }

    // Custom routing takes precedence
    if (this.customRoute) {
      const tier = this.customRoute(input, context);
      return this.models[tier];
    }

    // Budget-aware downgrade
    if (this.budgetMaxPerDay && this.dailySpend >= this.budgetMaxPerDay * 0.8) {
      return this.models.simple;
    }

    const tier = this.classify(input, context);
    return this.models[tier];
  }

  /**
   * Record spend for budget tracking.
   */
  recordSpend(amountUsd: number): void {
    this.dailySpend += amountUsd;
  }

  /**
   * Get current daily spend.
   */
  getDailySpend(): number {
    return this.dailySpend;
  }

  private classify(input: string, _context?: string): 'complex' | 'standard' | 'simple' {
    const len = input.length;
    const complexitySignals = this.countComplexitySignals(input);

    switch (this.strategy) {
      case 'quality-first':
        // Use the best model unless the task is trivially simple
        if (len < 100 && complexitySignals === 0) return 'standard';
        if (len < 50 && complexitySignals === 0) return 'simple';
        return 'complex';

      case 'cost-optimized':
        // Use the cheapest model unless complexity demands more
        if (complexitySignals >= 3 || len > 2000) return 'complex';
        if (complexitySignals >= 1 || len > 500) return 'standard';
        return 'simple';

      case 'balanced':
      default:
        // Default to standard, upgrade/downgrade based on signals
        if (complexitySignals >= 3 || len > 3000) return 'complex';
        if (complexitySignals === 0 && len < 200) return 'simple';
        return 'standard';
    }
  }

  /**
   * Heuristic complexity scoring based on input characteristics.
   * Returns 0-5+ signal count.
   */
  private countComplexitySignals(input: string): number {
    let signals = 0;
    const lower = input.toLowerCase();

    // Multi-step reasoning indicators
    if (/\b(analyze|architect|design|compare|evaluate|debug)\b/i.test(input)) signals++;

    // Code-related complexity
    if (/```[\s\S]*```/.test(input)) signals++;
    if (input.split('\n').length > 20) signals++;

    // Multiple questions or requirements
    const questionMarks = (input.match(/\?/g) || []).length;
    if (questionMarks >= 2) signals++;

    // Explicit complexity markers
    if (/\b(complex|detailed|thorough|comprehensive|in-depth)\b/i.test(lower)) signals++;

    // Lists of requirements
    const bulletPoints = (input.match(/^[-*•]\s/gm) || []).length;
    if (bulletPoints >= 3) signals++;

    return signals;
  }
}
