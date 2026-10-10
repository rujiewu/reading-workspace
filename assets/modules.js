/* Editorial module definitions. Never place user state or credentials here. */
window.HUB_MODULES = Object.freeze({
  investment: {
    eyebrow: "INVESTMENT OS", title: "投资决策",
    description: "把研究依据、反方、组合约束与后续复盘写成可检查的决策记录。",
    groupLabel: "决策材料", initialResource: "investment-workspace",
  },
  reading: {
    eyebrow: "READING AGENT", title: "深度阅读",
    description: "沿问题和知识主干阅读；区分已研究书籍、候选队列与证据边界。",
    groupLabel: "学科",
  },
  trading: {
    eyebrow: "TRADING AGENT", title: "交易研究",
    description: "沿证据、风险、验证和执行推进判断；不把案例变成实盘许可。",
    groupLabel: "资料类型",
  },
  learning: {
    eyebrow: "LEARNING AGENT", title: "学习系统",
    description: "沿知识主干理解前置关系，用完整对象、练习和迁移检验理解。",
    groupLabel: "学习领域",
    initialResource: "d11-v33-u1",
  },
});
