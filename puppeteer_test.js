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
      // start a match and let it run briefly
      await page.click('.play-button[data-mode]');
      await new Promise((r) => setTimeout(r, 500));

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
        goalBall: state.replayFrames[state.replayGoalFrame]?.ball || null,
        lastBall: state.replayFrames[state.replayFrames.length - 1]?.ball || null,
      }));
      console.log('IMMEDIATE', immediate);

      // wait several seconds for replay & reset to occur
      await new Promise((r) => setTimeout(r, 7000));

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
    } catch (e) {
      console.error('navigation failed', e);
    }

    await browser.close();
    server.close();
  });
})();