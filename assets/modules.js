/* Editorial module definitions. Never place user state or credentials here. */
window.HUB_MODULES = Object.freeze({
  investment: {
    eyebrow: "INVESTMENT OS", title: "投资决策",
    description: "依据、约束、决策与复盘。",
    groupLabel: "决策材料", initialResource: "investment-workspace",
  },
  reading: {
    eyebrow: "READING AGENT", title: "深度阅读",
    description: "读懂论证，追问证据。",
    groupLabel: "学科",
  },
  trading: {
    eyebrow: "TRADING AGENT", title: "交易研究",
    description: "机制、验证、风险与执行。",
    groupLabel: "资料类型",
  },
  learning: {
    eyebrow: "LEARNING AGENT", title: "学习系统",
    description: "理解、练习，再迁移。",
    groupLabel: "学习领域",
    initialResource: "d11-v33-u1",
  },
});
