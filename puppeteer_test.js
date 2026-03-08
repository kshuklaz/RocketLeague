const puppeteer = require('puppeteer');
const http = require('http');
const serveHandler = require('serve-handler');

(async () => {
  // start a simple http server on port 8001
  const server = http.createServer((req, res) => serveHandler(req, res, { public: '.' }));
  server.listen(8001, async () => {
    console.log('server started on http://localhost:8001');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => {
      console.log('PAGE LOG:', msg.text());
    });
    page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.toString());
      if (error.stack) console.log(error.stack);
    });
    page.on('error', error => {
      console.log('ERROR:', error.toString());
    });
    page.on('requestfailed', request => {
      console.log('REQUEST FAILED', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log('BAD RESPONSE', response.status(), response.url());
      }
    });

    try {
      await page.goto('http://localhost:8001', { waitUntil: 'networkidle2' });
      // inspect initial state on menu
      const initial = await page.evaluate(() => ({
        screen: state.screen,
        replayTimer: state.replayTimer,
        replayFrames: state.replayFrames.length,
        menuShot: state.menuShot,
        menuShotTimer: state.menuShotTimer,
      }));
      console.log('INITIAL', initial);
      // linger on the menu for a while (camera flybys) before interacting
      await new Promise((r) => setTimeout(r, 4000));
      // start a match and watch the kickoff countdown
      // pick a non-freeplay mode (duel) to ensure we see the AI kickoff
      await page.click('.play-button[data-mode="duel"]');
      // immediately inspect state to see if the click had an effect
      const afterClick = await page.evaluate(() => ({ screen: state.screen, mode: state.mode }));
      console.log('AFTER CLICK', afterClick);
      // wait for the game screen to appear and the first countdown number
      await page.waitForFunction(() => state.screen === 'game');
      await page.waitForFunction(() => state.bannerText !== '');
      const duringKickoff = await page.evaluate(() => ({
        timer: state.kickoffTimer,
        banner: state.bannerText,
        bannerTimer: state.bannerTimer,
      }));
      console.log('KICKOFF', duringKickoff);
      // nudge the match timer to just above zero and clear kickoff so that the
      // time‑expiry logic actually runs (we're still in the countdown otherwise).
      await page.evaluate(() => {
        state.matchTime = 0.002;
        state.kickoffTimer = 0;
      });
      await new Promise((r) => setTimeout(r, 200));
      const afterTimer = await page.evaluate(() => ({
        screen: state.screen,
        resultTitle: state.resultTitle,
      }));
      console.log('AFTER TIMER', afterTimer);
      // allow countdown to continue for a little while
      await new Promise((r) => setTimeout(r, 500));

      // confirm our constants were applied: ball should now be larger
      const ballRadius = await page.evaluate(() =>
        import('/src/constants.js').then((m) => m.BALL_RADIUS)
      );
      console.log('BALL RADIUS', ballRadius);
      // quick sanity check: car should accelerate quickly in 1/60 second
      const accelLog = await page.evaluate(() =>
        import('/src/physics.js').then((m) => {
          const car = state.cars[0];
          car.vx = car.vz = 0;
          m.updateCar(car, 1, 0, false, false, 1 / 60);
          return { vx: car.vx.toFixed(1), vz: car.vz.toFixed(1) };
        })
      );
      console.log('ACCEL', accelLog);
      // test freeplay restart: press R should reset match timer and ball.
      await page.evaluate(() => {
        state.mode = 'freeplay';
        state.screen = 'game';
        state.matchTime = 1;
        state.ball.x = 100;
        state.ball.y = 50;
        state.ball.vx = 123;
      });
      await page.keyboard.press('r');
      await new Promise((r) => setTimeout(r, 100));
      const afterRestart = await page.evaluate(() => ({
        matchTime: state.matchTime,
        ball: { x: state.ball.x, y: state.ball.y, vx: state.ball.vx },
        mode: state.mode,
      }));
      console.log('FREEPLAY RESTART', afterRestart);
      // restore duel mode before injecting a goal so resetAfterGoal doesn't crash
      await page.evaluate(() => { state.mode = 'duel'; });
      // verify that R does **not** restart during an actual game
      await page.evaluate(() => {
        state.matchTime = 10;
        state.ball.x = 50;
      });
      await page.keyboard.press('r');
      await new Promise((r) => setTimeout(r, 50));
      const duelR = await page.evaluate(() => ({ matchTime: state.matchTime, ballX: state.ball.x }));
      console.log('DUEL R', duelR);
      // shove the ball into the blue goal to force a score (use large X coordinate)
      // artificially mark a contact that happened 150 frames ago so we can
      // test the 2‑second offset behaviour even without a real collision.
      await page.evaluate(() => {
        // simulate a contact 150 frames ago by setting both values; trigger
        // sequence will clamp contactFrame = min(replayTouchCursor, len-1)
        state.replayTouchCursor = 150;
        state.replayContactFrame = 150;
        // ensure replayFrames has enough entries to avoid bounds issues
        while (state.replayFrames.length <= 160) {
          state.replayFrames.push(state.replayFrames[state.replayFrames.length - 1] || { cars: [], ball: {} });
        }
        state.ball.x = 2500;
        state.ball.y = 18;
        state.ball.z = 0;
      });

      // allow a couple frames for the score logic to execute
      await new Promise((r) => setTimeout(r, 200));
      const immediate = await page.evaluate(() => ({
        frames: state.replayFrames.length,
        contactFrame: state.replayContactFrame,
        cursorStart: state.replayCursor,
        offsetFrames: state.replayCursor - state.replayContactFrame,
        goalIndex: state.replayGoalFrame,
        replayTimer: state.replayTimer,
        goalBall: state.replayFrames[state.replayGoalFrame]?.ball || null,
        lastBall: state.replayFrames[state.replayFrames.length - 1]?.ball || null,
      }));
      console.log('IMMEDIATE', immediate);

      // wait a short time while the replay is still running, then verify
      // that the cursor has in fact made it all the way to the goal frame.
      await new Promise((r) => setTimeout(r, 2000));
      const midReplay = await page.evaluate(() => ({
        cursor: state.replayCursor,
        goal: state.replayGoalFrame,
        timer: state.replayTimer,
      }));
      console.log('MID', midReplay);

      // now wait a few more seconds for the replay to finish and reset
      await new Promise((r) => setTimeout(r, 5000));

      // friction test: shoot ball and check velocity drop after 1 second
      await page.evaluate(() => {
        state.ball.x = 0;
        state.ball.y = 36;
        state.ball.z = 0;
        state.ball.vx = 500;
        state.ball.vz = 0;
      });
      const beforeVel = await page.evaluate(() => ({vx: state.ball.vx, vz: state.ball.vz}));
      await new Promise((r) => setTimeout(r, 1100));
      const afterVel = await page.evaluate(() => ({vx: state.ball.vx, vz: state.ball.vz}));
      console.log('FRICTION', beforeVel, afterVel);

      // snapshot relevant state afterwards
      const postGoal = await page.evaluate(() => ({
        scores: { ...state.scores },
        replayTimer: state.replayTimer,
        replayFrames: state.replayFrames.length,
        lastReplayBall: state.replayFrames.length ? state.replayFrames[state.replayFrames.length - 1].ball : null,
        cars: state.cars.map(c => ({id:c.id,x:c.x,z:c.z,boost:c.boost})),
        kickoffTimer: state.kickoffTimer,
      }));
      console.log('AFTER GOAL', postGoal);

      // simulate pressing the garage button to go back to menu, then start a
      // new duel match. this ensures the menu buttons still work after a goal.
      await page.click('#garageButton');
      await new Promise((r) => setTimeout(r, 200));
      const postGarage = await page.evaluate(() => ({ screen: state.screen }));
      console.log('POST GARAGE', postGarage);
      await page.click('.play-button[data-mode="duel"]');
      await new Promise((r) => setTimeout(r, 500));
      const afterRestart2 = await page.evaluate(() => ({
        screen: state.screen,
        scores: state.scores,
        replayTimer: state.replayTimer,
      }));
      console.log('AFTER RESTART', afterRestart2);
    } catch (e) {
      console.error('navigation failed', e);
    }

    await browser.close();
    server.close();
  });
})();