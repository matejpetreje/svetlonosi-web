(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const ui = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    characterName: document.getElementById("characterName"),
    startPanel: document.getElementById("startPanel"),
    gameOverPanel: document.getElementById("gameOverPanel"),
    resultLabel: document.getElementById("resultLabel"),
    finalScore: document.getElementById("finalScore"),
    startButton: document.getElementById("startButton"),
    restartButton: document.getElementById("restartButton"),
    jumpButton: document.getElementById("jumpButton"),
    slideButton: document.getElementById("slideButton")
  };

  const W = canvas.width;
  const H = canvas.height;
  const CELL = 256;

  const SCENE = {
    groundY: 640,
    farY: 0,
    roadY: 407,
    roadH: 365,
    grassY: 610,
    grassH: 114
  };

  const PLAYER_SCALE = 1.22;
  const PLAYER_DW = CELL * PLAYER_SCALE;
  const PLAYER_DX_OFFSET = 75;
  const PLAYER_DY_OFFSET = 223;
  const FINISH_SCORE = 4000;
  const FINAL_OBSTACLE_PREP_SCORE = 3985;
  const FINISH_DURATION = 3.55;

  const PHYSICS = {
    jumpVelocity: -600,
    gravity: 850,
    minSlideTime: 1.6
  };

  const CUTSCENE = {
    fogInStart: 1.35,
    fogInEnd: 2.95,
    quakeStart: 2.9,
    quakeEnd: 3.9,
    ruinsSwap: 3.35,
    revealStart: 3.65,
    revealEnd: 5.0,
    deathStart: 4.18,
    deathEnd: 5.28,
    getUpStart: 5.30,
    getUpEnd: 6.72,
    turnStart: 7.12,
    runStart: 7.55,
    cameraSettleStart: 7.85,
    cameraSettleEnd: 10.75,
    end: 10.95,
    runSpeed: 320,
    rokarX: 845,
    gameplayX: 158,
    runEndAnchorX: 158 - PLAYER_DX_OFFSET + (CELL * PLAYER_SCALE) / 2,
    medusaX: 505,
    pubX: 65,
    pubY: 40,
    ruinsY: 9,
    pubSize: 770
  };

  const images = {};
  const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const characterDefs = [
    {
      name: "Rokar",
      milestone: 0,
      size: 1,
      runBottom: 202,
      airFrame: 5,
      landingFrame: 13,
      run: "assets/characters/rokar-run.png",
      jump: "assets/characters/rokar-jump.png",
      slide: "assets/characters/rokar-slide.png",
      frames: {run:23,jump:20,slide:14}
    },
    {
      name: "Rendel",
      milestone: 1000,
      size: 1.35,
      runBottom: 181,
      airFrame: 9,
      landingFrame: 13,
      run: "assets/characters/rendel-run.png",
      jump: "assets/characters/rendel-jump.png",
      slide: "assets/characters/rendel-slide.png",
      frames: {run:13,jump:15,slide:13}
    },
    {
      name: "Kartář",
      milestone: 2000,
      size: 1.21,
      runBottom: 191,
      airFrame: 9,
      landingFrame: 13,
      run: "assets/characters/kartar-run.png",
      jump: "assets/characters/kartar-jump.png",
      slide: "assets/characters/kartar-slide.png",
      frames: {run:21,jump:15,slide:14}
    },
    {
      name: "Ernst",
      milestone: 3000,
      size: 1.19,
      runBottom: 187,
      airFrame: 9,
      landingFrame: 13,
      run: "assets/characters/ernst-run.png",
      jump: "assets/characters/ernst-jump.png",
      slide: "assets/characters/ernst-slide.png",
      frames: {run:19,jump:15,slide:12}
    }
  ];

  const backgrounds = {
    far: "assets/backgrounds/far-landscape.png",
    road: "assets/backgrounds/road-layer.png",
    grass: "assets/backgrounds/grass-layer.png"
  };

  const obstacleAssets = {
    log: "assets/obstacles/log.png",
    branch: "assets/obstacles/branch-tree.png"
  };

  const fogAssets = {
    back: "assets/effects/Front-Fog-1.png",
    front: "assets/effects/Front-Fog-2.png"
  };

  const cutsceneAssets = {
    pub: "assets/cutscene/pub.png",
    ruins: "assets/cutscene/pub-ruins.png",
    medusa: "assets/cutscene/medusa-fly.png",
    rokarIdle: "assets/cutscene/rokar-idle.png",
    rokarDeath: "assets/cutscene/rokar-death.png",
    rokarGetUp: "assets/cutscene/rokar-get-up.png"
  };

  const cutsceneFrames = {
    rokarIdle: 12,
    rokarDeath: 12,
    rokarGetUp: 17,
    medusa: 17
  };

  let loaded = false;
  let running = false;
  let gameOver = false;
  let phase = "menu";
  let lastTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem("runner717-best") || 0);

  let farOffset = 0;
  let roadOffset = 0;
  let grassOffset = 0;

  let speed = 320;
  let spawnTimer = 2.0;
  let finishPending = false;
  let finalObstaclePrepared = false;
  let finishTimer = 0;
  let cutsceneTimer = 0;
  let endQuestionTimeout = null;

  const obstacles = [];

  const player = {
    x: 158,
    y: SCENE.groundY,
    vy: 0,
    state: "run",
    slideTimer: 0,
    characterIndex: 0,
    animTime: 0,
    milestoneFlash: 0
  };

  const keyState = { down: false };

  ui.best.textContent = String(best).padStart(5,"0");

  async function preload() {
    const all = [];

    for (const character of characterDefs) {
      for (const state of ["run","jump","slide"]) {
        const key = `${character.name}-${state}`;
        all.push(
          loadImage(character[state]).then(img => {
            images[key] = img;
          })
        );
      }
    }

    for (const [key, src] of Object.entries(backgrounds)) {
      all.push(
        loadImage(src).then(img => {
          images[`bg-${key}`] = img;
        })
      );
    }

    for (const [key, src] of Object.entries(obstacleAssets)) {
      all.push(
        loadImage(src).then(img => {
          images[`ob-${key}`] = img;
        })
      );
    }

    for (const [key, src] of Object.entries(fogAssets)) {
      all.push(
        loadImage(src).then(img => {
          images[`fog-${key}`] = img;
        })
      );
    }

    for (const [key, src] of Object.entries(cutsceneAssets)) {
      all.push(
        loadImage(src).then(img => {
          images[`cut-${key}`] = img;
        })
      );
    }

    await Promise.all(all);
    loaded = true;
    drawIdle();
  }

  function clearEndQuestionTimer() {
    if (endQuestionTimeout !== null) {
      window.clearTimeout(endQuestionTimeout);
      endQuestionTimeout = null;
    }
  }

  function reset() {
    clearEndQuestionTimer();

    score = 0;
    speed = 320;
    spawnTimer = 1.9;
    obstacles.length = 0;
    finishPending = false;
    finalObstaclePrepared = false;
    finishTimer = 0;
    cutsceneTimer = 0;

    farOffset = 0;
    roadOffset = 0;
    grassOffset = 0;

    player.x = 158;
    player.y = SCENE.groundY;
    player.vy = 0;
    player.state = "run";
    player.slideTimer = 0;
    player.characterIndex = 0;
    player.animTime = 0;
    player.milestoneFlash = 0;

    keyState.down = false;

    ui.score.textContent = "00000";
    ui.characterName.textContent = characterDefs[0].name;
    ui.resultLabel.textContent = "KONEC BĚHU";
    ui.finalScore.textContent = "0";

    gameOver = false;
  }

  function start() {
    if (!loaded) return;

    reset();
    running = true;
    phase = "cutscene";
    ui.startPanel.hidden = true;
    ui.startPanel.style.display = "none";
    ui.gameOverPanel.hidden = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function beginGameplay() {
    phase = "play";
    cutsceneTimer = CUTSCENE.end;

    const inheritedCameraX = cutsceneCameraX(CUTSCENE.end);
    player.x = CUTSCENE.gameplayX;
    player.y = SCENE.groundY;
    player.vy = 0;
    player.state = "run";
    player.slideTimer = 0;
    player.characterIndex = 0;
    player.animTime = CUTSCENE.end - CUTSCENE.runStart;
    player.milestoneFlash = 0;
    keyState.down = false;

    farOffset = inheritedCameraX * 0.08;
    roadOffset = inheritedCameraX;
    grassOffset = inheritedCameraX;
    speed = CUTSCENE.runSpeed;
    spawnTimer = 1.75;
    finishPending = false;
    finalObstaclePrepared = false;
    obstacles.length = 0;

    ui.score.textContent = "00000";
    ui.characterName.textContent = "Rokar";
  }

  function endGame(completed = false) {
    running = false;
    gameOver = true;
    phase = "gameover";
    keyState.down = false;

    const rounded = completed ? FINISH_SCORE : Math.floor(score);
    best = Math.max(best, rounded);
    localStorage.setItem("runner717-best", best);

    ui.best.textContent = String(best).padStart(5,"0");
    ui.finalScore.textContent = rounded;
    ui.resultLabel.textContent = completed ? "KONEC" : "KONEC BĚHU";
    ui.gameOverPanel.hidden = false;

    if (completed) {
      clearEndQuestionTimer();
      endQuestionTimeout = window.setTimeout(() => {
        if (gameOver && phase === "gameover") {
          ui.resultLabel.textContent = "KONEC?";
        }
      }, 2000);
    }
  }

  function isOnGround() {
    return Math.abs(player.y - SCENE.groundY) < 1;
  }

  function jump() {
    if (!running || phase !== "play" || finishPending && score >= FINISH_SCORE && obstacles.length === 0) return;

    if (isOnGround()) {
      player.vy = PHYSICS.jumpVelocity;
      player.state = "jump";
      player.animTime = 0;
      player.slideTimer = 0;
    }
  }

  function startSlide() {
    if (!running || phase !== "play" || finishPending && score >= FINISH_SCORE && obstacles.length === 0) return;

    if (isOnGround() && player.state === "run") {
      player.state = "slide";
      player.slideTimer = Math.max(player.slideTimer, PHYSICS.minSlideTime);
      player.animTime = 0;
    }
  }

  function update(dt) {
    if (phase === "cutscene") {
      updateCutscene(dt);
      return;
    }

    if (phase === "finish") {
      updateFinish(dt);
      return;
    }

    if (phase !== "play") return;

    farOffset += speed * 0.08 * dt;
    roadOffset += speed * dt;
    grassOffset += speed * dt;
    player.animTime += dt;

    score = Math.min(FINISH_SCORE, score + dt * 45);
    speed = Math.min(560, 320 + score * 0.055);
    ui.score.textContent = String(Math.floor(score)).padStart(5,"0");
    updateCharacterByMilestone();

    updatePlayerPhysics(dt);

    if (!finalObstaclePrepared && score >= FINAL_OBSTACLE_PREP_SCORE) {
      prepareFinalObstacle();
    }

    if (score < FINISH_SCORE && !finalObstaclePrepared) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const obstacle = spawnObstacle();
        const recovery = obstacle.type === "branch" ? 2.0 : 1.45;
        spawnTimer = obstacle.drawW / speed + recovery + Math.random() * 0.35;
      }
    } else if (score >= FINISH_SCORE) {
      finishPending = true;
    }

    for (const obstacle of obstacles) {
      obstacle.x -= speed * dt;
    }

    while (obstacles.length && obstacles[0].x + obstacles[0].drawW < 0) {
      obstacles.shift();
    }

    checkCollision();
    if (!running || phase !== "play") return;

    if (finishPending && obstacles.length === 0 && isOnGround()) {
      startFinish();
    }
  }

  function updateCutscene(dt) {
    cutsceneTimer += dt;
    player.animTime += dt;

    if (cutsceneTimer >= CUTSCENE.end) {
      beginGameplay();
    }
  }

  function updateFinish(dt) {
    finishTimer += dt;
    farOffset += speed * 0.08 * dt;
    roadOffset += speed * dt;
    grassOffset += speed * dt;
    player.animTime += dt;
    player.x += 340 * dt;

    if (finishTimer >= FINISH_DURATION) {
      endGame(true);
    }
  }

  function updatePlayerPhysics(dt) {
    if (player.state === "jump") {
      player.vy += PHYSICS.gravity * dt;
      player.y += player.vy * dt;

      if (player.y >= SCENE.groundY) {
        player.y = SCENE.groundY;
        player.vy = 0;
        if (keyState.down) {
          player.state = "slide";
          player.slideTimer = PHYSICS.minSlideTime;
        } else {
          player.state = "run";
          player.slideTimer = 0;
        }
        player.animTime = 0;
      }
    }

    if (player.state === "slide") {
      if (keyState.down) {
        player.slideTimer = Math.max(player.slideTimer, 0.16);
      }

      player.slideTimer -= dt;

      if (player.slideTimer <= 0 && !keyState.down) {
        player.state = "run";
        player.animTime = 0;
      }
    }

    if (player.milestoneFlash > 0) {
      player.milestoneFlash -= dt;
    }
  }

  function prepareFinalObstacle() {
    finalObstaclePrepared = true;
    spawnTimer = Number.POSITIVE_INFINITY;

    const hasUpcomingObstacle = obstacles.some(obstacle =>
      obstacle.x + obstacle.drawW > player.x + 520
    );

    if (!hasUpcomingObstacle) {
      spawnObstacle();
    }
  }

  function startFinish() {
    phase = "finish";
    finishTimer = 0;
    finishPending = false;
    obstacles.length = 0;
    player.characterIndex = characterDefs.length - 1;
    player.y = SCENE.groundY;
    player.vy = 0;
    player.state = "run";
    player.animTime = 0;
    player.milestoneFlash = 0;
    keyState.down = false;
    ui.characterName.textContent = "Ernst";
  }

  function updateCharacterByMilestone() {
    let next = 0;

    for (let i = 0; i < characterDefs.length; i++) {
      if (score >= characterDefs[i].milestone) {
        next = i;
      }
    }

    if (next !== player.characterIndex) {
      player.characterIndex = next;
      player.animTime = 0;
      player.milestoneFlash = 1.15;
      ui.characterName.textContent = characterDefs[next].name;
    }
  }

  function spawnObstacle() {
    const type = Math.random() < 0.52 ? "log" : "branch";
    const previous = obstacles[obstacles.length - 1];
    const gap = speed * (previous?.type === "branch" && type === "log" ? 2.0 : 1.4);
    const spawnX = Math.max(
      W + 95,
      previous ? previous.x + previous.drawW + gap : W + 95
    );

    if (type === "log") {
      const drawW = 270;
      const drawH = 220;
      const obstacle = {
        type,
        x: spawnX,
        y: SCENE.groundY - 128,
        drawW,
        drawH,
        hitbox: {kind: "log"}
      };
      obstacles.push(obstacle);
      return obstacle;
    }

    const drawW = 480;
    const drawH = 600;
    const obstacle = {
      type,
      x: spawnX,
      y: 120,
      drawW,
      drawH,
      trunkSplit: 0.43,
      hitbox: {kind: "branch"}
    };
    obstacles.push(obstacle);
    return obstacle;
  }

  function playerRect(stateOverride = player.state) {
    const dx = player.x - PLAYER_DX_OFFSET;
    const dy = player.y - PLAYER_DY_OFFSET;

    if (stateOverride === "slide") {
      if (player.animTime < 0.14) return playerRect("run");
      return {
        x: dx + 80,
        y: player.y - 100,
        w: 145,
        h: 112
      };
    }

    return {
      x: dx + 77,
      y: dy + 68,
      w: 127,
      h: 148
    };
  }

  function intersects(a,b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function checkCollision() {
    const p = playerRect();

    for (const obstacle of obstacles) {
      if (obstacleCollision(p, obstacle)) {
        endGame();
        return;
      }
    }
  }

  function obstacleCollision(p, obstacle) {
    const {x, y, drawW: w, drawH: h} = obstacle;

    if (obstacle.type === "branch") {
      return intersects(p, {
        x: x + w * .43,
        y: y + h * .59,
        w: w * .42,
        h: h * .085
      });
    }

    for (let i = 0; i < 6; i++) {
      const t = (i + .5) / 6;
      const band = {
        x: x + w * (.13 + i * .115),
        y: y + h * (.23 + t * .54),
        w: w * .15,
        h: h * .22
      };
      if (intersects(p, band)) return true;
    }

    return false;
  }

  function loop(now) {
    if (!running) return;

    const dt = Math.min(0.032, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);
    draw();

    if (running) {
      requestAnimationFrame(loop);
    }
  }

  function draw() {
    ctx.clearRect(0,0,W,H);

    if (phase === "menu" || phase === "cutscene") {
      drawCutscene();
      return;
    }

    drawGameplayWorld();
  }

  function drawGameplayWorld() {
    drawScrollingImage(images["bg-far"], farOffset, SCENE.farY, W, H);
    drawScrollingImage(images["bg-road"], roadOffset, SCENE.roadY, W, SCENE.roadH);

    const grad = ctx.createLinearGradient(0,420,0,H);
    grad.addColorStop(0,"rgba(0,0,0,0)");
    grad.addColorStop(1,"rgba(11,18,8,.16)");
    ctx.fillStyle = grad;
    ctx.fillRect(0,420,W,H-420);

    if (phase === "finish") drawFinishFog("back");
    drawObstacleBackParts();
    drawPlayer();
    drawObstacleFrontParts();

    drawScrollingImage(images["bg-grass"], grassOffset, SCENE.grassY, W, SCENE.grassH);
    if (phase === "finish") drawFinishFog("front");

    drawSpeedIndicator();

    if (player.milestoneFlash > 0 && phase === "play") {
      drawMilestoneFlash();
    }
  }

  function drawCutscene() {
    const t = phase === "menu" ? 0 : cutsceneTimer;
    const shake = cutsceneShake(t);
    const cameraX = cutsceneCameraX(t);

    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawScrollingImage(images["bg-far"], cameraX * 0.08, SCENE.farY, W, H);
    drawScrollingImage(images["bg-road"], cameraX, SCENE.roadY, W, SCENE.roadH);

    const showRuins = t >= CUTSCENE.ruinsSwap;
    drawCutscenePub(showRuins, cameraX);

    if (showRuins) {
      drawCutsceneMedusa(t, cameraX);
    }

    drawCutsceneFog(t, "back");
    drawCutsceneRokar(t, cameraX);
    drawScrollingImage(images["bg-grass"], cameraX, SCENE.grassY, W, SCENE.grassH);
    drawCutsceneFog(t, "front");

    ctx.restore();
  }

  function cutsceneShake(t) {
    if (t < CUTSCENE.quakeStart || t > CUTSCENE.quakeEnd) {
      return {x:0,y:0};
    }

    const inOut = Math.sin(
      ((t - CUTSCENE.quakeStart) / (CUTSCENE.quakeEnd - CUTSCENE.quakeStart)) * Math.PI
    );
    return {
      x: Math.round((Math.sin(t * 91) * 7 + Math.sin(t * 53) * 4) * inOut),
      y: Math.round((Math.cos(t * 77) * 5 + Math.sin(t * 41) * 3) * inOut)
    };
  }

  function drawCutscenePub(ruined, cameraX) {
    const img = images[ruined ? "cut-ruins" : "cut-pub"];
    if (!img) return;

    ctx.drawImage(
      img,
      CUTSCENE.pubX - cameraX,
      ruined ? CUTSCENE.ruinsY : CUTSCENE.pubY,
      CUTSCENE.pubSize,
      CUTSCENE.pubSize
    );
  }

  function drawCutsceneMedusa(t, cameraX) {
    const img = images["cut-medusa"];
    if (!img) return;

    const reveal = clamp01((t - CUTSCENE.revealStart) / 0.7);
    if (reveal <= 0) return;

    const fps = 10;
    const frame = Math.floor(Math.max(0, t - CUTSCENE.ruinsSwap) * fps) % cutsceneFrames.medusa;
    const bob = Math.sin(t * 2.6) * 7;

    ctx.save();
    ctx.globalAlpha = reveal;
    drawSpriteFrame(img, frame, {
      x: CUTSCENE.medusaX - cameraX,
      y: 195 + bob,
      scale: 1.58,
      anchor: "top-center",
      flipX: false
    });
    ctx.restore();
  }

  function drawCutsceneRokar(t, cameraX) {
    let sheet = images["cut-rokarIdle"];
    let frame = 0;
    let flipX = true;
    let x = CUTSCENE.rokarX - cameraX;
    let scale = 1.27;
    let bottom = 204;
    let feetY = SCENE.groundY + 1;

    if (t < CUTSCENE.deathStart) {
      frame = Math.floor(t * 8) % cutsceneFrames.rokarIdle;
    } else if (t < CUTSCENE.deathEnd) {
      sheet = images["cut-rokarDeath"];
      const p = clamp01((t - CUTSCENE.deathStart) / (CUTSCENE.deathEnd - CUTSCENE.deathStart));
      frame = Math.min(cutsceneFrames.rokarDeath - 1, Math.floor(p * cutsceneFrames.rokarDeath));
      bottom = 208;
    } else if (t < CUTSCENE.getUpEnd) {
      sheet = images["cut-rokarGetUp"];
      const p = clamp01((t - CUTSCENE.getUpStart) / (CUTSCENE.getUpEnd - CUTSCENE.getUpStart));
      frame = Math.min(cutsceneFrames.rokarGetUp - 1, Math.floor(p * cutsceneFrames.rokarGetUp));
      bottom = 203;
    } else if (t < CUTSCENE.runStart) {
      frame = Math.floor(t * 8) % cutsceneFrames.rokarIdle;
      if (t >= CUTSCENE.turnStart) {
        const turnP = clamp01((t - CUTSCENE.turnStart) / (CUTSCENE.runStart - CUTSCENE.turnStart));
        flipX = turnP < 0.52;
      }
    } else {
      sheet = images["Rokar-run"];
      const runT = t - CUTSCENE.runStart;
      frame = Math.floor(runT * 14) % characterDefs[0].frames.run;
      flipX = false;
      const worldX = cutsceneRokarWorldX(t);
      x = worldX - cameraX;
      scale = PLAYER_SCALE * characterDefs[0].size;
      bottom = characterDefs[0].runBottom;
      feetY = SCENE.groundY + 23;
    }

    if (!sheet) return;

    drawSpriteFrame(sheet, frame, {
      x,
      y: feetY,
      scale,
      anchor: "feet-center",
      sourceBottom: bottom,
      flipX
    });
  }

  function cutsceneRokarWorldX(t) {
    if (t <= CUTSCENE.runStart) return CUTSCENE.rokarX;
    return CUTSCENE.rokarX + (t - CUTSCENE.runStart) * CUTSCENE.runSpeed;
  }

  function cutsceneCameraX(t) {
    if (t <= CUTSCENE.runStart) return 0;

    const worldX = cutsceneRokarWorldX(t);
    const settle = smoothstep(CUTSCENE.cameraSettleStart, CUTSCENE.cameraSettleEnd, t);
    const desiredScreenX = CUTSCENE.rokarX + (CUTSCENE.runEndAnchorX - CUTSCENE.rokarX) * settle;

    return Math.max(0, worldX - desiredScreenX);
  }

  function drawCutsceneFog(t, layer) {
    const img = images[layer === "back" ? "fog-back" : "fog-front"];
    if (!img || phase === "menu") return;

    const fogIn = smoothstep(CUTSCENE.fogInStart, CUTSCENE.fogInEnd, t);
    const fogOut = smoothstep(CUTSCENE.revealStart, CUTSCENE.revealEnd, t);
    const amount = clamp01(fogIn * (1 - fogOut));

    if (amount <= 0.001) return;

    const front = layer === "front";
    const alpha = front ? 0.72 : 0.95;
    const drift = front ? 0.11 : 0;
    const rightX = W * (1 - amount) + W * drift;
    const leftX = -W * (1 - amount) - W * drift;

    ctx.save();
    ctx.globalAlpha = amount * alpha;

    ctx.drawImage(img, Math.round(rightX), 0, W, H);

    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, Math.round(-leftX), 0, W, H);

    ctx.restore();
  }

  function drawSpriteFrame(img, frame, options) {
    const cols = 5;
    const sx = (frame % cols) * CELL;
    const sy = Math.floor(frame / cols) * CELL;
    const scale = options.scale ?? 1;
    const drawW = CELL * scale;
    const drawH = CELL * scale;

    let dx = options.x;
    let dy = options.y;

    if (options.anchor === "top-center") {
      dx -= drawW / 2;
    } else if (options.anchor === "feet-center") {
      dx -= drawW / 2;
      const sourceBottom = options.sourceBottom ?? CELL;
      dy -= sourceBottom * scale;
    }

    ctx.save();

    if (options.flipX) {
      ctx.translate(Math.round(dx + drawW), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        img,
        sx, sy, CELL, CELL,
        0, Math.round(dy), drawW, drawH
      );
    } else {
      ctx.drawImage(
        img,
        sx, sy, CELL, CELL,
        Math.round(dx), Math.round(dy), drawW, drawH
      );
    }

    ctx.restore();
  }

  function drawIdle() {
    if (!loaded) return;
    phase = "menu";
    draw();
  }

  function drawScrollingImage(img, offset, y, targetW, targetH) {
    if (!img) return;

    const scale = targetH / img.height;
    const drawW = Math.round(img.width * scale);
    let x = -Math.floor(offset % drawW);

    while (x < targetW) {
      ctx.drawImage(img, x, y, drawW, targetH);
      x += drawW;
    }
  }

  function drawPlayer() {
    const def = characterDefs[player.characterIndex];
    const state = player.state;
    const sheet = images[`${def.name}-${state}`];

    if (!sheet) return;

    const frameCount = def.frames[state];
    const fps = 14;
    let frame;

    if (state === "jump") {
      const height = SCENE.groundY - player.y;
      if (player.animTime < .12) {
        frame = Math.min(2, Math.floor(player.animTime * 22));
      } else if (player.vy < 0 || height > 32) {
        frame = def.airFrame;
      } else {
        frame = def.landingFrame;
      }
    } else if (state === "slide") {
      frame = Math.min(frameCount - 1, Math.floor(player.animTime * 14));
    } else {
      frame = Math.floor(player.animTime * fps) % frameCount;
    }

    const cols = 5;
    const sx = (frame % cols) * CELL;
    const sy = Math.floor(frame / cols) * CELL;

    const scale = PLAYER_SCALE * def.size;
    const drawW = CELL * scale;
    const drawH = CELL * scale;
    const dx = player.x - PLAYER_DX_OFFSET - (drawW - PLAYER_DW) / 2;
    const dy = player.y + 23 - def.runBottom * scale;
    ctx.drawImage(sheet, sx, sy, CELL, CELL, dx, dy, drawW, drawH);
  }

  function drawFinishFog(layer) {
    const img = images[`fog-${layer}`];
    if (!img) return;

    const progress = clamp01(finishTimer / FINISH_DURATION);
    const eased = progress * progress * (3 - 2 * progress);
    const front = layer === "front";
    const entryDelay = front ? 0.12 : 0;
    const local = clamp01((eased - entryDelay) / (1 - entryDelay));
    const x = W * (1 - local) * (front ? 0.98 : 0.82);

    ctx.save();
    ctx.globalAlpha = (front ? .34 : .46) + local * (front ? .66 : .54);
    ctx.drawImage(img, Math.round(x), 0, W, H);
    ctx.restore();
  }

  function drawObstacleBackParts() {
    for (const obstacle of obstacles) {
      const img = images[`ob-${obstacle.type}`];
      if (!img) continue;

      if (obstacle.type === "branch") {
        const splitW = Math.floor(img.width * obstacle.trunkSplit);
        const drawSplitW = Math.floor(obstacle.drawW * obstacle.trunkSplit);
        ctx.drawImage(
          img,
          0, 0, splitW, img.height,
          Math.round(obstacle.x), Math.round(obstacle.y), drawSplitW, obstacle.drawH
        );
      } else {
        ctx.drawImage(img, Math.round(obstacle.x), Math.round(obstacle.y), obstacle.drawW, obstacle.drawH);
      }
    }
  }

  function drawObstacleFrontParts() {
    for (const obstacle of obstacles) {
      if (obstacle.type !== "branch") continue;
      const img = images[`ob-${obstacle.type}`];
      if (!img) continue;

      const splitW = Math.floor(img.width * obstacle.trunkSplit);
      const srcW = img.width - splitW;
      const drawX = Math.round(obstacle.x + obstacle.drawW * obstacle.trunkSplit);
      const drawW = Math.round(obstacle.drawW * (1 - obstacle.trunkSplit));

      ctx.drawImage(
        img,
        splitW, 0, srcW, img.height,
        drawX, Math.round(obstacle.y), drawW, obstacle.drawH
      );
    }
  }

  function drawSpeedIndicator() {
    if (phase === "cutscene" || phase === "menu") return;

    ctx.save();
    ctx.font = "700 14px system-ui";
    ctx.fillStyle = "rgba(255,248,221,.82)";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(speed)} px/s`, W - 20, 30);
    ctx.restore();
  }

  function drawMilestoneFlash() {
    const alpha = Math.min(1, player.milestoneFlash * 1.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(12,10,5,.68)";
    ctx.fillRect(420,55,440,86);
    ctx.strokeStyle = "#e6b750";
    ctx.lineWidth = 2;
    ctx.strokeRect(420,55,440,86);
    ctx.fillStyle = "#ffe49a";
    ctx.font = "800 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`NA TRAŤ VSTUPUJE ${characterDefs[player.characterIndex].name.toUpperCase()}`, W / 2, 108);
    ctx.restore();
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp01((value - edge0) / (edge1 - edge0));
    return x * x * (3 - 2 * x);
  }

  document.addEventListener("keydown", event => {
    if (["Space","ArrowUp","ArrowDown"].includes(event.code)) {
      event.preventDefault();
    }

    if (event.code === "Space" || event.code === "ArrowUp") {
      if (!running && (gameOver || phase === "menu")) {
        start();
      } else {
        jump();
      }
    }

    if (event.code === "ArrowDown") {
      if (keyState.down || event.repeat) return;
      keyState.down = true;
      startSlide();
    }
  });

  document.addEventListener("keyup", event => {
    if (event.code === "ArrowDown") {
      keyState.down = false;
    }
  });

  ui.startButton.addEventListener("click", start);
  ui.restartButton.addEventListener("click", start);

  ui.jumpButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    jump();
  });

  ui.slideButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    keyState.down = true;
    startSlide();
  });

  ui.slideButton.addEventListener("pointerup", () => {
    keyState.down = false;
  });

  ui.slideButton.addEventListener("pointercancel", () => {
    keyState.down = false;
  });

  preload().catch(error => {
    console.error(error);
    ui.startPanel.querySelector("p").textContent = "Nepodařilo se načíst herní assety. Spusť hru přes lokální HTTP server.";
  });
})();
