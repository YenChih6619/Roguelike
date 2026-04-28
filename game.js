let CARD_LIBRARY = {};
let ENEMY_LIBRARY = {};
let gameState = {
     player: { hp: 50, maxHp: 50, energy: 3, maxEnergy: 3, block: 0, attackBuff: 0 },
     enemy: null,
     deck: [], drawPile: [], hand: [], discardPile: [],
     isPlayerTurn: true, battleCount: 0, handLimit: 10
};

/**
 * 初始化遊戲
 */
async function initGame() {
     try {
          const [c, e] = await Promise.all([
               fetch('cards.json').then(res => res.json()),
               fetch('enemies.json').then(res => res.json())
          ]);
          CARD_LIBRARY = c;
          ENEMY_LIBRARY = e;

          generateInitialDeck(8);
          setupEventListeners();
          showCentralMessage("開始冒險");
          nextBattle();
     } catch (err) {
          console.error("載入失敗，啟動備用資料:", err);
          loadMockData();
     }
}

function setupEventListeners() {
     document.getElementById('end-turn-btn').onclick = endPlayerTurn;
     document.getElementById('skip-reward-btn').onclick = closeReward;
}

/**
 * 核心：執行卡牌效果
 * 解決「加攻後傷害沒變」的問題
 */
function executeCardEffect(i) {
     const key = gameState.hand[i];
     const data = CARD_LIBRARY[key];

     if (gameState.player.energy < data.cost) return;

     // 扣除能量
     gameState.player.energy -= data.cost;

     // --- 關鍵修正：必須先判定 Ability 並更新 Buff ---
     if (data.type === 'ability') {
          if (data.buff) {
               gameState.player.attackBuff += data.buff;
               showCentralMessage(`力量提升！+${data.buff}`);
          }
     }

     // --- 接著再處理傷害與防禦 ---
     if (data.type === 'attack') {
          // 這裡會正確抓到剛剛才加進去的 attackBuff
          const totalDamage = data.damage + gameState.player.attackBuff;
          processDamage(gameState.enemy, totalDamage);
     } else if (data.type === 'defense') {
          gameState.player.block += data.block;
     } else if (data.type === 'utility') {
          if (data.debuff) gameState.enemy.tempDebuff = (gameState.enemy.tempDebuff || 0) + data.debuff;
          showCentralMessage(`削弱敵人！`);
     }

     // 處理手牌去向
     gameState.hand.splice(i, 1);
     if (data.type !== 'ability') {
          gameState.discardPile.push(key);
     }

     // --- 關鍵修正：立即重新渲染手牌 ---
     // 這樣下一張攻擊牌的描述才會立刻反映出最新的 Buff 狀態
     renderHand();
     updateUI();

     if (gameState.enemy.hp <= 0) {
          showCentralMessage("勝利！");
          setTimeout(showReward, 1000);
     }
}

/**
 * 處理傷害與護甲
 */
function processDamage(target, amount) {
     const targetEl = target === gameState.player ? document.getElementById('player') : document.getElementById('enemy');

     // 受傷動畫
     targetEl.classList.remove('unit-hurt'); void targetEl.offsetWidth; targetEl.classList.add('unit-hurt');

     // 數字彈出
     const rect = targetEl.getBoundingClientRect();
     const popup = document.createElement('div');
     popup.className = 'damage-popup';
     popup.innerText = `-${amount}`;
     popup.style.left = `${rect.left + rect.width / 2}px`;
     popup.style.top = `${rect.top}px`;
     document.body.appendChild(popup);
     setTimeout(() => popup.remove(), 800);

     // 護甲抵扣邏輯
     if (target.block >= amount) {
          target.block -= amount;
     } else {
          const remainingDmg = amount - target.block;
          target.block = 0;
          target.hp = Math.max(0, target.hp - remainingDmg);
     }
     updateUI();
}

/**
 * 渲染手牌 (含即時傷害計算顯示)
 */
function renderHand() {
     const container = document.getElementById('hand');
     container.innerHTML = '';
     gameState.hand.forEach((k, i) => {
          const d = CARD_LIBRARY[k];
          const el = document.createElement('div');
          el.className = 'card card-draw';
          el.setAttribute('data-type', d.type);

          let displayDesc = d.description;
          if (d.type === 'attack') {
               const finalDmg = d.damage + gameState.player.attackBuff;
               const buffText = gameState.player.attackBuff > 0 ? ` (<span style="color:red">+${gameState.player.attackBuff}</span>)` : "";
               displayDesc = `造成 ${d.damage}${buffText} 點傷害`;
          }

          el.innerHTML = `<strong>${d.name}</strong><small>${displayDesc}</small><b>🔋${d.cost}</b>`;
          el.onclick = () => playCardWithAnim(i, el);
          container.appendChild(el);
     });
}

function startPlayerTurn() {
     gameState.isPlayerTurn = true;
     gameState.player.energy = gameState.player.maxEnergy;
     gameState.player.block = 0;

     const actions = gameState.enemy.actions;
     gameState.enemy.nextMove = actions[Math.floor(Math.random() * actions.length)];
     document.getElementById('enemy-intent').innerText = `意圖：${gameState.enemy.nextMove.icon}${gameState.enemy.nextMove.value || ''}`;

     drawCards(5);
     updateUI();
}

function endPlayerTurn() {
     if (!gameState.isPlayerTurn) return;
     gameState.isPlayerTurn = false;
     gameState.discardPile.push(...gameState.hand);
     gameState.hand = [];
     renderHand();
     showCentralMessage("敵人回合");
     setTimeout(enemyTurn, 800);
}

function enemyTurn() {
     const m = gameState.enemy.nextMove;
     const debuff = gameState.enemy.tempDebuff || 0;
     const finalDmg = Math.max(0, (m.value || 0) - debuff);

     const enemyEl = document.getElementById('enemy');
     enemyEl.classList.add('unit-attack');

     setTimeout(() => {
          enemyEl.classList.remove('unit-attack');
          if (m.type === 'attack') processDamage(gameState.player, finalDmg);
          else if (m.type === 'defend') gameState.enemy.block += m.value;

          gameState.enemy.tempDebuff = 0;

          if (gameState.player.hp <= 0) {
               showCentralMessage("戰敗");
               setTimeout(() => location.reload(), 2000);
          } else {
               setTimeout(() => { showCentralMessage("你的回合"); startPlayerTurn(); }, 600);
          }
     }, 400);
}

function drawCards(n) {
     for (let i = 0; i < n; i++) {
          if (gameState.drawPile.length === 0) {
               if (gameState.discardPile.length === 0) break;
               gameState.drawPile = [...gameState.discardPile];
               gameState.discardPile = [];
               shuffle(gameState.drawPile);
          }
          if (gameState.hand.length < gameState.handLimit) {
               gameState.hand.push(gameState.drawPile.pop());
          }
     }
     renderHand();
}

function playCardWithAnim(i, el) {
     if (!gameState.isPlayerTurn) return;
     const cardData = CARD_LIBRARY[gameState.hand[i]];
     if (gameState.player.energy >= cardData.cost) {
          el.classList.add('card-play');
          setTimeout(() => executeCardEffect(i), 250);
     } else {
          showCentralMessage("能量不足！");
     }
}

function nextBattle() {
     gameState.battleCount++;
     gameState.player.attackBuff = 0;
     showCentralMessage(`第 ${gameState.battleCount} 關`);
     const eKeys = Object.keys(ENEMY_LIBRARY);
     spawnEnemy(eKeys[Math.floor(Math.random() * eKeys.length)]);
     gameState.player.block = 0;
     gameState.drawPile = [...gameState.deck];
     gameState.discardPile = [];
     gameState.hand = [];
     shuffle(gameState.drawPile);
     startPlayerTurn();
}

function spawnEnemy(id) {
     const d = ENEMY_LIBRARY[id];
     gameState.enemy = { ...d, hp: d.maxHp, block: 0, tempDebuff: 0 };
     document.getElementById('enemy-name').innerText = d.name;
     document.querySelector('#enemy .avatar').innerText = d.avatar;
     updateUI();
}

function updateUI() {
     const p = gameState.player, e = gameState.enemy;

     // 更新 HP
     document.getElementById('player-hp').style.width = (p.hp / p.maxHp * 100) + '%';
     document.getElementById('player-hp-text').innerText = `${p.hp}/${p.maxHp}`;

     // 更新護甲
     document.getElementById('player-block').innerText = `🛡️ ${p.block}`;

     // --- 新增：更新攻擊加成 UI ---
     const buffEl = document.getElementById('player-buff');
     if (buffEl) {
          buffEl.innerText = `⚔️ +${p.attackBuff}`;
          // 如果有加成，添加動畫類別，否則移除
          if (p.attackBuff > 0) {
               buffEl.classList.add('buff-active');
          } else {
               buffEl.classList.remove('buff-active');
          }
     }

     // 更新能量
     document.getElementById('energy-value').innerText = p.energy;

     // 更新敵人資訊
     if (e) {
          document.getElementById('enemy-hp').style.width = (e.hp / e.maxHp * 100) + '%';
          document.getElementById('enemy-hp-text').innerText = `${Math.floor(e.hp)}/${e.maxHp}`;
          document.getElementById('enemy-block').innerText = `🛡️ ${e.block}`;
     }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } }

function showCentralMessage(txt) {
     const el = document.getElementById('central-log');
     el.innerText = txt; el.classList.remove('fade-in-out'); void el.offsetWidth; el.classList.add('fade-in-out');
}

function generateInitialDeck(n) {
     const keys = ["strike", "defend", "reinforce", "abate"];
     gameState.deck = [];
     for (let i = 0; i < n; i++) gameState.deck.push(keys[i % keys.length]);
}

function showReward() {
     const m = document.getElementById('reward-modal'), o = document.getElementById('reward-options');
     m.classList.remove('hidden'); o.innerHTML = '';
     const keys = Object.keys(CARD_LIBRARY);
     for (let i = 0; i < 3; i++) {
          const k = keys[Math.floor(Math.random() * keys.length)];
          const d = CARD_LIBRARY[k];
          const div = document.createElement('div'); div.className = 'card';
          div.innerHTML = `<strong>${d.name}</strong><span>${d.description}</span><b>🔋${d.cost}</b>`;
          div.onclick = () => { gameState.deck.push(k); closeReward(); };
          o.appendChild(div);
     }
}

function closeReward() { document.getElementById('reward-modal').classList.add('hidden'); nextBattle(); }

function loadMockData() {
     CARD_LIBRARY = {
          strike: { name: "打擊", type: "attack", damage: 6, cost: 1, description: "造成 6 點傷害" },
          defend: { name: "防禦", type: "defense", block: 5, cost: 1, description: "獲得 5 點護甲" },
          reinforce: { name: "變強", type: "ability", buff: 1, cost: 2, description: "增加 1 攻" },
          abate: { name: "虛弱", type: "utility", debuff: 4, cost: 1, description: "敵人傷害 -4" }
     };
     ENEMY_LIBRARY = {
          slime: { name: "小史萊姆", maxHp: 30, avatar: "🧪", actions: [{ type: 'attack', value: 7, icon: '⚔️' }] }
     };
     generateInitialDeck(8);
     setupEventListeners();
     nextBattle();
}

document.addEventListener('DOMContentLoaded', initGame);