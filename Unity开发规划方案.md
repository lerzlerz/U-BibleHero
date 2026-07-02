# 《心灵迷宫：圣所探秘》Unity 开发规划方案与模块映射指南

本指南旨在将基于 Web MVP（React + Canvas）实现的游戏逻辑，翻译映射到 **Unity (2D)** 引擎的开发架构体系中，并提供具体的核心 C# 脚本规划与组件配置方案，以便于在 Unity 中完成项目的移植与重构。

---

## 一、 核心功能模块映射表

| Web MVP 系统 | Unity 对应的组件 / 系统 | 说明与开发规划 |
| :--- | :--- | :--- |
| **Canvas 渲染 & 瓦片地图** | **Tilemap System (2D)** | 使用 Unity 2D 的 Tilemap 绘制森林。可分设 `Floor_Tilemap`（地面）和 `Obstacles_Tilemap`（碰撞树木）。 |
| **小人移动与碰撞** | **Rigidbody 2D & Collider 2D** | 玩家挂载 `Rigidbody 2D`（设为 Kinematic 以防物理滑行）和 `Box Collider 2D`。树木挂载 `Tilemap Collider 2D` 并使用 `Composite Collider 2D` 优化性能。 |
| **火把光晕与战争迷雾** | **URP 2D Light (Universal Render Pipeline)** | **无需写代码！** 开启 URP，将全局光照（Global Light 2D）调暗，在玩家（Player）上挂载一个 `Light 2D` (Point)，类型设为 Yellow 暖色光，开启阴影（Shadows）。树木碰撞体开启 `Shadow Caster 2D` 即可实现火把和动态树影效果。 |
| **NPC 触发与点亮蜡烛** | **Trigger Collider & Collider toggle** | NPC 挂载 `Circle Collider 2D` (勾选 `Is Trigger` 作为交互范围)。玩家靠近时，通过脚本检测触发进入，交互后修改精灵（Sprite）为蜡烛，并关闭其阻挡碰撞（或移出 Collision Layer），变为可穿透。 |
| **萤火虫粒子效果** | **2D Particle System** | 在玩家节点下挂载 `Particle System`. 形状（Shape）设为圆形，开启 Noise（噪点移动）来模拟微弱闪烁的萤火虫随玩家行走的漂浮效果。 |
| **问答 JSON 数据库** | **ScriptableObjects** | 将 `questions.json` 和 `profiles.json` 转化为 Unity 的 `ScriptableObject`，便于在 Inspector 中可视化配置题目和性格数据。 |
| **毛玻璃问答 UI 卡片** | **UI Canvas (UGUI / UI Toolkit)** | 创建 Canvas 并配置 UI 浮层。使用 `TextMeshPro` 渲染文本，并通过 URP 材质设置 `Screen Space UI Blur` shader 还原磨砂玻璃背景。 |
| **单题随机跳过 (Cheat)** | **Input Manager & ScoreManager** | 在 `Update` 循环中监听键盘 `T` 键，或在 UI 按钮上绑定事件，调用逻辑修改得分并标记 NPC。 |

---

## 二、 核心 C# 脚本规划与代码蓝图

### 1. 数据结构设计：问题与画像 (Data Layer)
在 Unity 中，使用 `ScriptableObject` 存储问题 and 画像最为优雅，免去频繁读取 JSON 文件的开销。

```csharp
// QuestionData.cs
using System;
using UnityEngine;

[CreateAssetMenu(fileName = "NewQuestion", menuName = "DISC/Question")]
public class QuestionData : ScriptableObject
{
    public int id;
    [TextArea(3, 5)]
    public string questionText;
    public Option[] options = new Option[4];

    [Serializable]
    public struct Option
    {
        public string text;
        public string type; // "D", "I", "S", "C"
    }
}
```

---

### 2. 玩家控制器与移动 (Movement & Interaction)
实现 2D 走格子（Grid-based）的平滑移动，并在移动中进行物理碰撞检测。

```csharp
// PlayerController.cs
using System.Collections;
using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float moveSpeed = 5f;
    private bool isMoving = false;
    private Vector2 gridPosition;
    private NPC activeNPC = null; // 当前靠近的NPC

    void Start()
    {
        gridPosition = transform.position;
    }

    void Update()
    {
        if (isMoving) return;

        float horizontal = Input.GetAxisRaw("Horizontal");
        float vertical = Input.GetAxisRaw("Vertical");

        if (horizontal != 0)
        {
            StartCoroutine(MoveRoutine(new Vector3(horizontal, 0, 0)));
        }
        else if (vertical != 0)
        {
            StartCoroutine(MoveRoutine(new Vector3(0, vertical, 0)));
        }

        // 交互逻辑
        if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.E))
        {
            if (activeNPC != null && !activeNPC.isResolved)
            {
                DialogueManager.Instance.StartDialogue(activeNPC);
            }
        }
    }

    IEnumerator MoveRoutine(Vector3 direction)
    {
        Vector3 targetPos = transform.position + direction;

        // 碰撞检测：利用 Physics2D.OverlapPoint 检查目标格子是否为障碍物
        Collider2D hit = Physics2D.OverlapPoint(targetPos);
        if (hit != null && !hit.isTrigger)
        {
            // 碰到实体障碍物（且非 Trigger 交互圈），阻挡移动
            if (hit.CompareTag("NPC") && hit.GetComponent<NPC>().isResolved)
            {
                // 已解答的NPC允许穿透
            }
            else
            {
                yield break; 
            }
        }

        isMoving = true;
        while (Vector3.Distance(transform.position, targetPos) > 0.01f)
        {
            transform.position = Vector3.MoveTowards(transform.position, targetPos, moveSpeed * Time.deltaTime);
            yield return null;
        }
        transform.position = targetPos;
        isMoving = false;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("NPC"))
        {
            activeNPC = other.GetComponent<NPC>();
            // 显示 UI 提示：例如“按 Space 答题”
            UIManager.Instance.ShowInteractionPrompt(true, activeNPC.npcEmoji);
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        if (other.CompareTag("NPC") && other.GetComponent<NPC>() == activeNPC)
        {
            activeNPC = null;
            UIManager.Instance.ShowInteractionPrompt(false);
        }
    }
}
```

---

### 3. NPC 控制器与穿透逻辑 (NPC State)
NPC 具有两种状态：未答题（水晶球/挡路）、已答题（蜡烛/可穿透）。

```csharp
// NPC.cs
using UnityEngine;

public class NPC : MonoBehaviour
{
    public int npcIndex; // 0 到 19
    public string npcEmoji;
    public bool isResolved = false;
    
    [Header("Sprites")]
    public Sprite activeSprite;
    public Sprite candleSprite;

    private SpriteRenderer spriteRenderer;
    private BoxCollider2D obstacleCollider; // 物理阻挡碰撞体

    void Awake()
    {
        spriteRenderer = GetComponent<SpriteRenderer>();
        obstacleCollider = GetComponent<BoxCollider2D>();
    }

    public void Resolve()
    {
        isResolved = true;
        spriteRenderer.sprite = candleSprite; // 换成蜡烛
        obstacleCollider.enabled = false;    // 禁用碰撞阻挡，使玩家可以穿透
        
        // 可以在这里播放点亮火花的粒子动效
    }
}
```

---

### 4. 答题管理与单题随机 (Dialogue & Cheat)
管理答题的状态机，并承载“X关闭”与“T键随机答题”逻辑。

```csharp
// DialogueManager.cs
using System.Collections.Generic;
using UnityEngine;

public class DialogueManager : MonoBehaviour
{
    public static DialogueManager Instance;

    public GameObject dialoguePanel; // UI面板
    private NPC currentNPC;
    private int currentStep = 0; // 0 或 1
    
    private Dictionary<int, string> answers = new Dictionary<int, string>();

    void Awake()
    {
        Instance = this;
        dialoguePanel.SetActive(false);
    }

    void Update()
    {
        if (!dialoguePanel.activeSelf) return;

        // Esc 或 Q 关闭对话
        if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Q))
        {
            CloseDialogue();
        }

        // T 键随机单题作答
        if (Input.GetKeyDown(KeyCode.T))
        {
            AnswerRandomly();
        }
    }

    public void StartDialogue(NPC npc)
    {
        currentNPC = npc;
        currentStep = 0;
        dialoguePanel.SetActive(true);
        DisplayQuestion();
    }

    void DisplayQuestion()
    {
        int questionId = (currentStep == 0) ? currentNPC.npcIndex + 1 : currentNPC.npcIndex + 21;
        // 获取 QuestionData 并渲染到 UI Text 和 Button 上
        UIManager.Instance.RenderQuestion(questionId);
    }

    public void SelectOption(string type)
    {
        int questionId = (currentStep == 0) ? currentNPC.npcIndex + 1 : currentNPC.npcIndex + 21;
        answers[questionId] = type;

        if (currentStep == 0)
        {
            currentStep = 1;
            DisplayQuestion();
        }
        else
        {
            // 答完两题，NPC 解决
            currentNPC.Resolve();
            GameManager.Instance.OnNpcResolved(currentNPC.npcIndex);
            CloseDialogue();
        }
    }

    public void AnswerRandomly()
    {
        string[] types = { "D", "I", "S", "C" };
        string randomType = types[Random.Range(0, 4)];
        SelectOption(randomType);
    }

    public void CloseDialogue()
    {
        dialoguePanel.SetActive(false);
        currentNPC = null;
    }
}
```

---

## 三、 Unity 独有画质升级建议

在 Unity 引擎中，您可以将原极简 MVP 的视觉和表现力提升到极高品质：

1. **动态阴影 (URP 2D Light)**：
   在树木 Tilemap 上挂载 **Shadow Caster 2D**。玩家的火把移动时，林间所有树影会根据光源距离和角度产生拉长、偏转的动态遮蔽效果。
2. **后处理特效 (Post-Processing)**：
   在主摄像机挂载 Volume，开启 **Bloom (辉光)** 和 **Vignette (晕影)**。让发光的水晶球 NPC 产生朦胧而温润的蓝色荧光，烘托神秘的圣所气氛。
3. **磨砂玻璃材质 (UI Glassmorphism)**：
   使用 URP 提供的 Screen Space UI Blur 材质，使答题卡片背后的游戏场景产生柔和的失焦模糊效果，让玩家能够专注回答性格问题。
