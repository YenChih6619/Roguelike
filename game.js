let CARD_LIBRARY = {};
let ENEMY_LIBRARY = {};
let gameState = {
     player: { hp: 50, maxHp: 50, energy: 3, maxEnergy: 3, block: 0 },
     enemy: null,
     deck: [], drawPile: [], hand: [], discardPile: [],
     isPlayerTurn: true, battleCount: 0, handLimit: 10
};

async function initGame() {
     try {
          const [c, e] = await Promise.all([fetch('Cards.json'), fetch('enemies.json')]);
          CARD_LIBRARY = await c.json();
          ENEMY_LIBRARY = await e.json();
          generateInitialDeck(8);
          document.getElementById('end-turn-btn').onclick = endPlayerTurn;
          document.getElementById('skip-reward-btn').onclick = closeReward;
          showCentralMessage("開始冒險");
          nextBattle();
     } catch (err) { alert("請確保使用 Live Server 開啟並具備 JSON 檔案"); }
}

function generateInitialDeck(n) {
     const keys = Object.keys(CARD_LIBRARY);
     for (let i = 0; i < n; i++) gameState.deck.push(keys[Math.floor(Math.random() * keys.length)]);
}

function nextBattle() {
     gameState.battleCount++;
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
     gameState.enemy = { ...d, hp: d.maxHp, block: 0, nextMove: null };
     document.getElementById('enemy-name').innerText = d.name;
     document.querySelector('#enemy .avatar').innerText = d.avatar;
     updateUI();
}

function drawCards(n) {
     for (let i = 0; i < n; i++) {
          if (gameState.drawPile.length === 0) {
               if (gameState.discardPile.length === 0) break;
               gameState.drawPile = [...gameState.discardPile];
               gameState.discardPile = [];
               shuffle(gameState.drawPile);
          }
          const cardKey = gameState.drawPile.pop();
          if (gameState.hand.length < gameState.handLimit) {
               gameState.hand.push(cardKey);
          } else {
               gameState.discardPile.push(cardKey);
               showCentralMessage("手牌已滿");
          }
     }
     renderHand();
}

function renderHand() {
     const c = document.getElementById('hand');
     c.innerHTML = '';
     gameState.hand.forEach((k, i) => {
          const d = CARD_LIBRARY[k];
          const el = document.createElement('div');
          el.className = 'card card-draw';
          el.innerHTML = `<strong>${d.name}</strong><small>${d.description}</small><b>🔋${d.cost}</b>`;
          el.onclick = () => playCardWithAnim(i, el);
          c.appendChild(el);
     });
}

function playCardWithAnim(i, el) {
     if (!gameState.isPlayerTurn) return;
     const cardData = CARD_LIBRARY[gameState.hand[i]];
     if (gameState.player.energy >= cardData.cost) {
          el.classList.add('card-play'); // 觸發出牌動畫
          setTimeout(() => executeCardEffect(i), 250);
     } else {
          showCentralMessage("能量不足！");
     }
}

function executeCardEffect(i) {
     const key = gameState.hand[i];
     const data = CARD_LIBRARY[key];
     gameState.player.energy -= data.cost;

     if (data.type === 'attack') {
          document.getElementById('player').classList.add('unit-attack');
          setTimeout(() => document.getElementById('player').classList.remove('unit-attack'), 300);
          processDamage(gameState.enemy, data.damage);
     } else if (data.type === 'defense') {
          gameState.player.block += data.block;
     } else if (data.type === 'utility' && data.draw) {
          drawCards(data.draw);
     }

     gameState.hand.splice(i, 1);
     gameState.discardPile.push(key);
     renderHand();
     updateUI();

     if (gameState.enemy.hp <= 0) {
          gameState.isPlayerTurn = false;
          showCentralMessage("勝利！");
          setTimeout(showReward, 1000);
     }
}

function processDamage(target, amount) {
     const targetEl = target === gameState.player ? document.getElementById('player') : document.getElementById('enemy');

     // 受傷動畫與彈出數字
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

     // 傷害邏輯
     if (target.block >= amount) {
          target.block -= amount;
     } else {
          const d = amount - target.block;
          target.block = 0;
          target.hp = Math.max(0, target.hp - d);
     }
     updateUI();
}

function endPlayerTurn() {
     if (!gameState.isPlayerTurn) return;
     gameState.isPlayerTurn = false;
     gameState.discardPile.push(...gameState.hand);
     gameState.hand = [];
     renderHand();
     showCentralMessage("敵人行動");
     setTimeout(enemyTurn, 800);
}

function enemyTurn() {
     const m = gameState.enemy.nextMove;
     const enemyEl = document.getElementById('enemy');
     enemyEl.classList.add('unit-attack');

     setTimeout(() => {
          enemyEl.classList.remove('unit-attack');
          if (m.type === 'attack') processDamage(gameState.player, m.value);
          else if (m.type === 'defend') gameState.enemy.block += m.value;

          if (gameState.player.hp <= 0) {
               showCentralMessage("戰敗...");
               setTimeout(() => location.reload(), 2000);
          } else {
               setTimeout(() => { showCentralMessage("你的回合"); startPlayerTurn(); }, 600);
          }
     }, 400);
}

function startPlayerTurn() {
     gameState.isPlayerTurn = true;
     gameState.player.energy = gameState.player.maxEnergy;
     gameState.player.block = 0;
     // 隨機決定敵人意圖
     const actions = gameState.enemy.actions;
     gameState.enemy.nextMove = actions[Math.floor(Math.random() * actions.length)];
     document.getElementById('enemy-intent').innerText = `意圖：${gameState.enemy.nextMove.icon}${gameState.enemy.nextMove.value || ''}`;
     drawCards(5);
     updateUI();
}

function showCentralMessage(txt) {
     const el = document.getElementById('central-log');
     el.innerText = txt;
     el.classList.remove('fade-in-out');
     void el.offsetWidth;
     el.classList.add('fade-in-out');
}

function updateUI() {
     const p = gameState.player, e = gameState.enemy;
     document.getElementById('player-hp').style.width = (p.hp / p.maxHp * 100) + '%';
     document.getElementById('player-hp-text').innerText = `${p.hp}/${p.maxHp}`;
     document.getElementById('player-block').innerText = `🛡️ ${p.block}`;
     document.getElementById('energy-value').innerText = p.energy;
     if (e) {
          document.getElementById('enemy-hp').style.width = (e.hp / e.maxHp * 100) + '%';
          document.getElementById('enemy-hp-text').innerText = `${Math.floor(e.hp)}/${e.maxHp}`;
          document.getElementById('enemy-block').innerText = `🛡️ ${e.block}`;
     }
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
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } }
function updateLog(m) { document.getElementById('log').innerText = m; }

document.addEventListener('DOMContentLoaded', initGame);