# 《心灵迷宫：圣所探秘》游戏化行为测评开发策略 (Vibe Coding Strategy)

**文档版本**：v1.0.0  
**存档日期**：2026年7月1日  
**项目目标**：将传统的 DISC 及 MBTI 文本选择题问卷，逐步转化为以玩家在迷宫探索、机关解谜和 NPC 互动中的“真实行为”为依据的**内隐式心理测量系统**。

---

## 一、 核心设计理念：内隐行为测评 (Implicit Assessment)

传统的性格测试（如 40 题 DISC 选择）存在两个局限性：**枯燥感**与**迎合偏差**（玩家会在答题时选择“社会期望”的选项而非真实自我）。
本策略通过在 Unity 中捕捉玩家在游戏关卡中的即时反应和决策，构建以下四个行为映射层：

1.  **D (支配/目标) ➡️ 效率与冒险偏好**：面对危机和障碍时，玩家是否倾向于最直接、快速、甚至高风险的物理方式解决。
2.  **I (影响/社交) ➡️ 人际链接与表达**：玩家在地图上是否具备高密度的 NPC 探索欲，以及在遭遇冲突时是否优先采用言语说服。
3.  **S (稳健/和平) ➡️ 安全感与避险倾向**：玩家在移动路线上的规划性、步速的稳定性，以及是否极力逃避对抗和不确定性。
4.  **C (分析/秩序) ➡️ 逻辑、规则与完美度**：玩家对规则（告示牌、教程）的阅读耐心，对背包物品整理的条理性，以及对地图迷雾的扫图完整度。

---

## 二、 交互行为特征与指标埋点矩阵

在 Unity 中，我们将玩家在场景中的操作转化为量化的 DISC 分值，并在后台数据统计类中累加：

| 游戏内动作/行为 | 对应的心理学测试题转换 | DISC 映射分值 | MBTI 偏向维度 |
| :--- | :--- | :--- | :--- |
| **快速奔跑/尝试危险跳跃** | “富于冒险、敢于决策” | **D** 增加重量级 | **P (知觉)** |
| **反复查看教程/整理背包** | “井井有条、遵守规范” | **C** 增加重量级 | **J (判断) / S (实感)** |
| **与大量中立动物/NPC交互**| “善于社交、友善随和” | **I** 增加重量级 | **E (外倾)** |
| **沿最宽最安全的道路平稳慢行**| “平和稳定、避免对质” | **S** 增加重量级 | **I (内倾)** |
| **剧情选项：理性冷酷但效益最高**| “善于分析、注重事实” | **C** 增加重量级 | **T (思考)** |
| **剧情选项：照顾情感放弃金币**| “同情心强、体贴他人” | **I / S** 增加重量级 | **F (情感)** |

---

## 三、 情境关卡解谜设计 (Scenario Designs)

通过在迷宫中设置具体的物理关卡，实现“无字化答题”。

### 1. 关卡示例一：林中急流 (The Ravine)
*   **情境**：前方木桥断裂，玩家无法通过。
    *   **分支动作 A（直接跨越）**：尝试使用大位移或冲刺技能强行跳过断崖（可能失败掉血）。
        *   *加分*：`D +2.0`, `P +1.0` (高风险承受力)。
    *   **分支动作 B（搬运垫脚）**：折返寻找周围的碎木、箱子，整齐地堆叠在桥头，平稳走过。
        *   *加分*：`C +1.5`, `J +1.0` (规则遵循、耐心解决)。
    *   **分支动作 C（说服渔夫）**：沿着河边走，发现一只渔船和垂钓的老人，通过分支对话说服其载自己过河。
        *   *加分*：`I +2.0`, `F +1.0` (寻求社会支持)。
    *   **分支动作 D（绕远避险）**：放弃眼前通道，转身走一条漫长、弯曲但没有任何危险的远路绕过河流。
        *   *加分*：`S +2.0`, `I +1.0` (平和稳健、安全至上)。

### 2. 关卡示例二：遗迹古门与警告石碑 (The Locked Crypt)
*   **情境**：一扇紧闭的石门，旁边有一块刻满文字的警告石碑。
    *   **动作 1（仔细观察）**：玩家走到石碑前，停留超过 10 秒并翻页阅读完所有规则，再开始解谜。
        *   *加分*：`C +2.0` (注意细节、善于分析)。
    *   **动作 2（直接试错）**：完全不看石碑上的字，走上前对门锁进行疯狂的穷举乱按尝试打开。
        *   *加分*：`D +1.0`, `N +2.0` (直觉试错、轻率冒险)。

---

## 四、 遥测统计后台实现 (C# Unity Telemetry Engine)

在 Unity 中，我们可以使用一个轻量级的全局单例脚本来收集所有物理物件触发的行为数据，并最终计算 DISC 性格卡牌：

```csharp
// TelemetryManager.cs
using System.Collections.Generic;
using UnityEngine;

public class TelemetryManager : MonoBehaviour
{
    public static TelemetryManager Instance;

    // 存放玩家行为数据的底层数据库（DISC累积权重值）
    private Dictionary<string, float> behavioralWeights = new Dictionary<string, float>()
    {
        { "D", 0f }, { "I", 0f }, { "S", 0f }, { "C", 0f }
    };

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject); // 切换关卡时不销毁
        }
        else
        {
            Destroy(gameObject);
        }
    }

    /// <summary>
    /// 当玩家在场景中触发特定交互或选择时，调用此方法累加分值
    /// </summary>
    /// <param name="dimension">DISC维度的字母键</param>
    /// <param name="weight">增加的分值权重</param>
    /// <param name="description">行为调试说明</param>
    public void RecordBehavior(string dimension, float weight, string description = "")
    {
        if (behavioralWeights.ContainsKey(dimension))
        {
            behavioralWeights[dimension] += weight;
            Debug.Log($"[性格遥测] 行为日志: {description} | 维度 {dimension} 增加权重: {weight}");
        }
    }

    /// <summary>
    /// 将累加的总权重折算为 40 分制的 DISC 标准分，供给性格画像引擎进行比对
    /// </summary>
    public Dictionary<string, float> GetNormalizedScores()
    {
        float total = behavioralWeights["D"] + behavioralWeights["I"] + behavioralWeights["S"] + behavioralWeights["C"];
        if (total == 0) return behavioralWeights;

        var normalized = new Dictionary<string, float>();
        foreach (var kvp in behavioralWeights)
        {
            normalized[kvp.Key] = (kvp.Value / total) * 40f;
        }
        return normalized;
    }
}
```

---

## 五、 项目演进路线建议 (Roadmap)

1.  **阶段 1（当前）**：基于 Emojis 和方块的 2D 网格漫游，NPC 承载传统文字问卷，打通 16 种性格卡牌的计算与展示逻辑。
2.  **阶段 2（混合探索）**：在 Unity 中开发精美视觉后，将其中 **10-15 道** 极端的测试题替换为**物理机关或剧情任务分歧点**（利用 `TelemetryManager.Instance.RecordBehavior` 传参）。剩余普通题继续保留在水晶球问答中。
3.  **阶段 3（完全内隐）**：当行为分析算法调整稳定后，完全取消对话卡片的文本单选题，依靠玩家全程通过关卡的方式（如用时、对话率、技能使用倾向、解谜选择）在终点圣殿直接解锁其对应的圣徒命运卡。
