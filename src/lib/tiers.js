/**
 * Tier enforcement for MyUru.
 * FREE: 2 sequential agents. PRO: 5 concurrent + config packs.
 */

const TIERS = {
  FREE: {
    name: "Free",
    maxAgents: 2,
    maxConcurrency: 1,
    configPacks: false,
    price: 0,
  },
  PRO: {
    name: "Pro",
    maxAgents: 5,
    maxConcurrency: 5,
    configPacks: true,
    price: 2900,
  },
};

class TierManager {
  constructor(tier = "FREE") {
    this.tier = TIERS[tier] || TIERS.FREE;
  }

  canRunAgents(count) {
    if (count > this.tier.maxAgents) {
      return {
        allowed: false,
        reason: `Tier "${this.tier.name}" allows max ${this.tier.maxAgents} agents. You requested ${count}.`,
        upgrade: `Upgrade to Pro ($29) for up to ${TIERS.PRO.maxAgents} agents.`,
      };
    }
    return { allowed: true };
  }

  canUseConcurrency() {
    if (this.tier.maxConcurrency === 1) {
      return {
        allowed: false,
        reason: "Free tier only supports sequential execution.",
        upgrade: "Upgrade to Pro ($29) for concurrent orchestration.",
      };
    }
    return { allowed: true };
  }

  enforceLimit(agentCount, concurrent = false) {
    const check = this.canRunAgents(agentCount);
    if (!check.allowed) throw new Error(`${check.reason}\n${check.upgrade}`);

    if (concurrent) {
      const concCheck = this.canUseConcurrency();
      if (!concCheck.allowed) {
        console.warn(`  ${concCheck.reason} Running sequentially.`);
        return false;
      }
      return true;
    }
    return true;
  }

  info() {
    return {
      tier: this.tier.name,
      price: this.tier.price === 0 ? "Free" : `$${(this.tier.price / 100).toFixed(2)}`,
      maxAgents: this.tier.maxAgents,
      concurrency: this.tier.maxConcurrency > 1 ? "concurrent" : "sequential",
      configPacks: this.tier.configPacks,
    };
  }
}

module.exports = { TierManager, TIERS };
