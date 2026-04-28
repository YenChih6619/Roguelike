let CARD_LIBRARY = {};
let ENEMY_LIBRARY = {};

let gameState = {
     player: { hp: 50, maxHp: 50, energy: 3, maxEnergy: 3, block: 0 },
     enemy: null,
     deck: [],          // 永久牌組
     drawPile: [],      // 戰鬥抽牌堆
     hand: [],          // 手牌
     discardPile: [],   // 棄牌堆
     isPlayerTurn: true,
     battleCount: 0,
     handLimit: 10
};

async function initGame() {
     try {
          const [c, e] = await Promise.all([fetch('Cards.json'), fetch('enemies.json')]);
          CARD_LIBRARY = await c.json();
          ENEMY_LIBRARY = await e.json();
          generateInitialDeck(10);
          document.getElementById('end-turn-btn').onclick = endPlayerTurn;
          document.getElementById('skip-reward-btn').onclick = closeReward;
          showCentralMessage("冒險開始");
          nextBattle();
     } catch (err) {
          updateLog("初始化失敗，請檢查 JSON 檔案路徑。");
     }
}

function generateInitialDeck(n) {
     const keys = Object.keys(CARD_LIBRARY);
     for (let i = 0; i < n; i++) gameState.deck.push(keys[Math.floor(Math.random() * keys.length)]);
}

function nextBattle() {
     gameState.battleCount++;
     showCentralMessage(`第 ${gameState.battleCount} 場戰鬥`);
     const eKeys = Object.keys(ENEMY_LIBRARY);
     spawnEnemy(eKeys[Math.floor(Math.random() * eKeys.length)]);
     gameState.player.block = 0;
     gameState.hand = [];
     gameState.discardPile = [];
     gameState.drawPile = [...gameState.deck];
     shuffle(gameState.drawPile);
     startPlayerTurn();
}

function drawCards(n) {
     for (let i = 0; i < n; i++) {
          if (gameState.drawPile.length === 0) {
               if (gameState.discardPile.length === 0) break;
               gameState.drawPile = [...gameState.discardPile];
               gameState.discardPile = [];
               shuffle(gameState.drawPile);
               updateLog("牌組洗回。");
          }
          const card = gameState.drawPile.pop();
          if (gameState.hand.length < gameState.handLimit) {
               gameState.hand.push(card);
          } else {
               gameState.discardPile.push(card);
               showCentralMessage("手牌已滿！");
               updateLog(`溢出丟棄: ${CARD_LIBRARY[card].name}`);
          }
     }
     renderHand();
}

function playCard(i) {
     if (!gameState.isPlayerTurn) return;
     const key = gameState.hand[i];
     const data = CARD_LIBRARY[key];

     if (gameState.player.energy >= data.cost) {
          gameState.player.energy -= data.cost;
          if (data.type === 'attack') processDamage(gameState.enemy, data.damage);
          else if (data.type === 'defense') gameState.player.block += data.block;
          else if (data.type === 'utility' && data.draw) drawCards(data.draw);

          gameState.hand.splice(i, 1);
          gameState.discardPile.push(key);
          renderHand();
          updateUI();

          if (gameState.enemy.hp <= 0) {
               gameState.isPlayerTurn = false;
               showCentralMessage("戰鬥勝利！");
               setTimeout(showReward, 1500);
          }
     } else {
          showCentralMessage("能量不足！");
     }
}

function endPlayerTurn() {
     if (!gameState.isPlayerTurn) return;
     gameState.isPlayerTurn = false;
     gameState.discardPile.push(...gameState.hand);
     gameState.hand = [];
     renderHand();
     showCentralMessage("敵人行動");
     setTimeout(enemyTurn, 1000);
}

function enemyTurn() {
     const m = gameState.enemy.nextMove;
     if (m.type === 'attack') processDamage(gameState.player, m.value);
     else if (m.type === 'defend') gameState.enemy.block += m.value;
     updateUI();
     if (gameState.player.hp <= 0) {
          showCentralMessage("戰敗");
          setTimeout(() => location.reload(), 2000);
     } else {
          setTimeout(() => { showCentralMessage("你的回合"); startPlayerTurn(); }, 1000);
     }
}

// 通用工具
function showCentralMessage(txt) {
     const el = document.getElementById('central-log');
     el.innerText = txt;
     el.classList.remove('fade-in-out');
     void el.offsetWidth;
     el.classList.add('fade-in-out');
}

function processDamage(t, a) {
     if (t.block >= a) t.block -= a;
     else { const d = a - t.block; t.block = 0; t.hp = Math.max(0, t.hp - d); }
}

function spawnEnemy(id) {
     const d = ENEMY_LIBRARY[id];
     gameState.enemy = { name: d.name, hp: d.maxHp, maxHp: d.maxHp, block: 0, avatar: d.avatar, actions: d.actions, nextMove: null };
     document.getElementById('enemy-name').innerText = d.name;
     document.querySelector('#enemy .avatar').innerText = d.avatar;
     updateUI();
}

function generateEnemyIntent() {
     const m = gameState.enemy.actions[Math.floor(Math.random() * gameState.enemy.actions.length)];
     gameState.enemy.nextMove = m;
     document.getElementById('enemy-intent').innerText = `意圖：${m.icon} ${m.value || ''}`;
}

function startPlayerTurn() {
     gameState.isPlayerTurn = true;
     gameState.player.energy = gameState.player.maxEnergy;
     gameState.player.block = 0;
     generateEnemyIntent();
     drawCards(5);
     updateUI();
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } }

function renderHand() {
     const c = document.getElementById('hand');
     c.innerHTML = '';
     gameState.hand.forEach((k, i) => {
          const d = CARD_LIBRARY[k];
          const el = document.createElement('div');
          el.className = 'card';
          el.innerHTML = `<strong>${d.name}</strong><br><small>${d.description}</small><br><b>🔋${d.cost}</b>`;
          el.onclick = () => playCard(i);
          c.appendChild(el);
     });
}

function updateUI() {
     const p = gameState.player, e = gameState.enemy;
     document.getElementById('player-hp').style.width = (p.hp / p.maxHp * 100) + '%';
     document.getElementById('player-hp-text').innerText = `${p.hp}/${p.maxHp}`;
     document.getElementById('player-block').innerText = `🛡️ ${p.block}`;
     document.getElementById('energy-value').innerText = p.energy;
     if (e) {
          document.getElementById('enemy-hp').style.width = (e.hp / e.maxHp * 100) + '%';
          document.getElementById('enemy-hp-text').innerText = `${e.hp}/${e.maxHp}`;
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
          div.innerHTML = `<strong>${d.name}</strong><br><small>${d.description}</small><br><b>🔋${d.cost}</b>`;
          div.onclick = () => { gameState.deck.push(k); closeReward(); };
          o.appendChild(div);
     }
}

function closeReward() { document.getElementById('reward-modal').classList.add('hidden'); nextBattle(); }
function updateLog(m) { document.getElementById('log').innerText = m; }

document.addEventListener('DOMContentLoaded', initGame);