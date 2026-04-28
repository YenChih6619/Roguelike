let CARD_LIBRARY = {};
let ENEMY_LIBRARY = {};
let gameState = {
     player: { hp: 50, maxHp: 50, energy: 3, maxEnergy: 3, block: 0, attackBuff: 0 },
     enemy: null,
     deck: [], drawPile: [], hand: [], discardPile: [],
     isPlayerTurn: true, battleCount: 0, handLimit: 10
};

async function initGame() {
     try {
          const [c, e] = await Promise.all([
               fetch('cards.json').then(res => res.json()),
               fetch('enemies.json').then(res => res.json())
          ]);
          CARD_LIBRARY = c;
          ENEMY_LIBRARY = e;

          generateInitialDeck();
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
 * 特定起始牌組設定
 */
function generateInitialDeck() {
     const startingCards = [
          'strike', 'strike', 'strike', 'strike', 'strike',
          'defend', 'defend', 'defend', 'defend', 'defend',
          'abate', 'reinforce',
          'evolve', 'evolve'
     ];
     gameState.deck = [...startingCards];
}

/**
 * 核心抽牌邏輯：從抽牌堆拿一張牌，若沒牌則洗牌
 */
function drawOneCard() {
     if (gameState.drawPile.length === 0) {
          if (gameState.discardPile.length === 0) return false; // 全都沒牌了

          // 洗牌：棄牌堆 -> 抽牌堆
          gameState.drawPile = [...gameState.discardPile];
          gameState.discardPile = [];
          shuffle(gameState.drawPile);
          showCentralMessage("重新洗牌");
     }

     if (gameState.hand.length < gameState.handLimit) {
          const card = gameState.drawPile.pop();
          gameState.hand.push(card);
          updateUI();
          return true;
     }
     return false;
}

/**
 * 批次抽牌 (用於回合開始)
 */
function drawCards(n) {
     for (let i = 0; i < n; i++) {
          if (!drawOneCard()) break;
     }
     renderHand();
}

/**
 * 執行卡牌效果
 */
function executeCardEffect(i) {
     const key = gameState.hand[i];
     const data = CARD_LIBRARY[key];

     if (gameState.player.energy < data.cost) return;

     gameState.player.energy -= data.cost;

     // 處理效果
     if (data.type === 'ability') {
          if (data.buff) gameState.player.attackBuff += data.buff;
          showCentralMessage(`${data.name}！`);
     } else if (data.type === 'attack') {
          const totalDamage = data.damage + gameState.player.attackBuff;
          processDamage(gameState.enemy, totalDamage);
     } else if (data.type === 'defense') {
          gameState.player.block += data.block;
     } else if (data.type === 'utility') {
          if (data.debuff) gameState.enemy.tempDebuff = (gameState.enemy.tempDebuff || 0) + data.debuff;
          showCentralMessage(`${data.name}！`);
     }

     // --- 【關鍵：處理額外抽牌效果】 ---
     // 假設卡牌 JSON 中有 draw 屬性，例如 { "name": "進化", "draw": 1 ... }
     if (data.draw && data.draw > 0) {
          for (let j = 0; j < data.draw; j++) {
               drawOneCard();
          }
     }

     // 移動卡牌位置
     gameState.hand.splice(i, 1);
     if (data.type !== 'ability') {
          gameState.discardPile.push(key);
     }

     renderHand();
     updateUI();

     if (gameState.enemy.hp <= 0) {
          showCentralMessage("勝利！");
          setTimeout(showReward, 1000);
     }
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

function processDamage(target, amount) {
     const isPlayer = (target === gameState.player);
     const targetEl = document.getElementById(isPlayer ? 'player' : 'enemy');

     targetEl.classList.remove('unit-hurt');
     void targetEl.offsetWidth;
     targetEl.classList.add('unit-hurt');

     const rect = targetEl.getBoundingClientRect();
     const popup = document.createElement('div');
     popup.className = 'damage-popup';
     popup.innerText = `-${amount}`;
     popup.style.left = `${rect.left + rect.width / 2}px`;
     popup.style.top = `${rect.top}px`;
     document.body.appendChild(popup);
     setTimeout(() => popup.remove(), 800);

     if (target.block >= amount) {
          target.block -= amount;
     } else {
          const remainingDmg = amount - target.block;
          target.block = 0;
          target.hp = Math.max(0, target.hp - remainingDmg);
     }
     updateUI();
}

function updateUI() {
     const p = gameState.player, e = gameState.enemy;

     document.getElementById('player-hp').style.width = (p.hp / p.maxHp * 100) + '%';
     document.getElementById('player-hp-text').innerText = `${p.hp}/${p.maxHp}`;
     document.getElementById('player-block').innerText = `🛡️ ${p.block}`;

     const buffEl = document.getElementById('player-buff');
     buffEl.innerText = `⚔️ +${p.attackBuff}`;
     p.attackBuff > 0 ? buffEl.classList.add('buff-active') : buffEl.classList.remove('buff-active');

     document.getElementById('draw-count').innerText = gameState.drawPile.length;
     document.getElementById('discard-count').innerText = gameState.discardPile.length;

     document.getElementById('energy-value').innerText = p.energy;

     if (e) {
          document.getElementById('enemy-hp').style.width = (e.hp / e.maxHp * 100) + '%';
          document.getElementById('enemy-hp-text').innerText = `${Math.floor(e.hp)}/${e.maxHp}`;
          document.getElementById('enemy-block').innerText = `🛡️ ${e.block}`;
     }
}

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
               displayDesc = `造成 ${finalDmg} 點傷害`;
          }

          el.innerHTML = `<strong>${d.name}</strong><small>${displayDesc}</small><b>🔋${d.cost}</b>`;
          el.onclick = () => playCardWithAnim(i, el);
          container.appendChild(el);
     });
}

function showPile(type) {
     const modal = document.getElementById('pile-modal');
     const list = document.getElementById('pile-list');
     const title = document.getElementById('pile-title');

     let targetCards = [];
     if (type === 'draw') {
          title.innerText = "抽牌堆";
          targetCards = [...gameState.drawPile];
     } else if (type === 'discard') {
          title.innerText = "棄牌堆";
          targetCards = gameState.discardPile;
     } else {
          title.innerText = "目前牌組";
          targetCards = gameState.deck;
     }

     list.innerHTML = '';
     targetCards.forEach(key => {
          const d = CARD_LIBRARY[key];
          const el = document.createElement('div');
          el.className = 'card';
          el.innerHTML = `<strong>${d.name}</strong><small>${d.description}</small><b>🔋${d.cost}</b>`;
          list.appendChild(el);
     });
     modal.classList.remove('hidden');
}

function closePile() {
     document.getElementById('pile-modal').classList.add('hidden');
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
               showCentralMessage("戰敗...");
               setTimeout(() => location.reload(), 2000);
          } else {
               setTimeout(() => {
                    showCentralMessage("你的回合");
                    startPlayerTurn();
               }, 600);
          }
     }, 400);
}

function nextBattle() {
     gameState.battleCount++;
     gameState.player.attackBuff = 0;
     showCentralMessage(`第 ${gameState.battleCount} 關`);

     const eKeys = Object.keys(ENEMY_LIBRARY);
     const randomEnemy = eKeys[Math.floor(Math.random() * eKeys.length)];
     const d = ENEMY_LIBRARY[randomEnemy];

     gameState.enemy = { ...d, hp: d.maxHp, block: 0, tempDebuff: 0 };
     document.getElementById('enemy-name').innerText = d.name;
     document.querySelector('#enemy .avatar').innerText = d.avatar;

     gameState.drawPile = [...gameState.deck];
     gameState.discardPile = [];
     gameState.hand = [];
     shuffle(gameState.drawPile);

     startPlayerTurn();
}

function shuffle(a) {
     for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
     }
}

function showCentralMessage(txt) {
     const el = document.getElementById('central-log');
     el.innerText = txt;
     el.classList.remove('fade-in-out');
     void el.offsetWidth;
     el.classList.add('fade-in-out');
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
          abate: { name: "虛弱", type: "utility", debuff: 4, cost: 1, description: "敵人傷害 -4" },
          evolve: { name: "進化", type: "ability", buff: 2, cost: 2, draw: 1, description: "增加 2 攻，抽 1 張牌" }
     };
     ENEMY_LIBRARY = {
          slime: { name: "小史萊姆", maxHp: 30, avatar: "🧪", actions: [{ type: 'attack', value: 7, icon: '⚔️' }] }
     };
     generateInitialDeck();
     setupEventListeners();
     nextBattle();
}

document.addEventListener('DOMContentLoaded', initGame);