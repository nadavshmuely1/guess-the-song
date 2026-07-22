(function () {
  "use strict";

  var CLIP_SECONDS = 5;
  var MAX_HINTS = 4;
  var LOADING_TIMEOUT_MS = 5000; // גבול זמן למסך הטעינה (שלא ייתקע)

  var state = {
    currentIndex: 0,
    hintsShown: 0,
    audios: [],       // אלמנט Audio לכל שיר
    ready: [],        // האם האודיו של שיר i נטען ומוכן לניגון מיידי
    readyCount: 0,
    gameStarted: false,
    loadingDone: false,
    songReady: false,
    playTimeout: null,
    countdownInterval: null,
    clipToken: 0
  };

  var loadingScreen = document.getElementById("loading-screen");
  var introScreen = document.getElementById("intro-screen");
  var songScreen = document.getElementById("song-screen");
  var endScreen = document.getElementById("end-screen");

  var loadingBarFill = document.getElementById("loading-bar-fill");
  var loadingCount = document.getElementById("loading-count");

  var startBtn = document.getElementById("start-btn");
  var playBtn = document.getElementById("play-btn");
  var playText = playBtn.querySelector(".play-text");
  var playRing = playBtn.querySelector(".ring-progress");
  var playCount = playBtn.querySelector(".play-count");
  var songCounter = document.getElementById("song-counter");
  var progressFill = document.getElementById("progress-fill");
  var answerForm = document.getElementById("answer-form");
  var answerInput = document.getElementById("answer-input");
  var feedback = document.getElementById("feedback");
  var hintBtn = document.getElementById("hint-btn");
  var hintsLeftEl = document.getElementById("hints-left");
  var hintsList = document.getElementById("hints-list");
  var giftBox = document.getElementById("gift-box");
  var prizeReveal = document.getElementById("prize-reveal");

  function showScreen(el) {
    [loadingScreen, introScreen, songScreen, endScreen].forEach(function (s) {
      s.classList.remove("active");
    });
    el.classList.add("active");
  }

  function normalize(str) {
    var s = (str || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (s.charAt(0) === "ה") {
      s = s.slice(1);
    }
    return s;
  }

  function currentAudio() {
    return state.audios[state.currentIndex];
  }

  // ===================== טעינה מראש של כל השירים =====================

  function updateLoadingProgress() {
    var pct = Math.round((state.readyCount / SONGS.length) * 100);
    if (loadingBarFill) {
      loadingBarFill.style.width = pct + "%";
    }
    if (loadingCount) {
      loadingCount.textContent = "טוען שירים " + state.readyCount + "/" + SONGS.length;
    }
  }

  function finishLoading() {
    if (state.loadingDone) {
      return;
    }
    state.loadingDone = true;
    showScreen(introScreen);
  }

  function markReady(i) {
    if (!state.ready[i]) {
      state.ready[i] = true;
      state.readyCount++;
      updateLoadingProgress();
      if (state.readyCount >= SONGS.length) {
        finishLoading();
      }
    }
  }

  function createAudios() {
    SONGS.forEach(function (song, i) {
      var a = new Audio();
      a.preload = "auto";
      state.ready[i] = false;
      a.addEventListener("canplaythrough", function () { markReady(i); });
      a.addEventListener("canplay", function () { markReady(i); });
      a.addEventListener("loadeddata", function () { markReady(i); });
      a.addEventListener("loadedmetadata", function () { markReady(i); });
      a.addEventListener("error", function () { markReady(i); }); // לא לתקוע את הטעינה
      a.src = song.audio;
      a.load();
      state.audios[i] = a;
    });

    // גיבוי: בדיקת readyState (חלק מהדפדפנים לא שולחים canplaythrough לפני מחווה)
    var poll = setInterval(function () {
      state.audios.forEach(function (a, i) {
        if (a && a.readyState >= 3) { markReady(i); }
      });
      if (state.readyCount >= SONGS.length) { clearInterval(poll); }
    }, 250);

    setTimeout(finishLoading, LOADING_TIMEOUT_MS);
  }

  // ===================== כפתור ההשמעה =====================

  function setPlayState(mode) {
    state.songReady = (mode === "ready");
    playBtn.classList.remove("starting", "playing");
    playBtn.classList.toggle("loading", mode === "loading");
    playBtn.disabled = (mode === "loading");
    playCount.textContent = "";
    if (mode === "ready") {
      playText.textContent = "השמע";
    } else if (mode === "loading") {
      playText.textContent = "טוען...";
    } else if (mode === "error") {
      playText.textContent = "שגיאה בטעינה";
    }
  }

  function resetClipTimers() {
    if (state.playTimeout) { clearTimeout(state.playTimeout); state.playTimeout = null; }
    if (state.countdownInterval) { clearInterval(state.countdownInterval); state.countdownInterval = null; }
    playBtn.classList.remove("playing", "starting");
    playCount.textContent = "";
  }

  function stopClip() {
    resetClipTimers();
    var a = currentAudio();
    if (a) { try { a.pause(); } catch (e) {} }
    if (state.songReady) {
      playText.textContent = "השמע";
    }
  }

  // מפעיל את חיווי הניגון (טבעת מתרוקנת + ספירת שניות) ומתזמן עצירה אחרי 5 שניות.
  function armClip(myToken) {
    playBtn.classList.remove("starting");
    playBtn.classList.add("playing");
    playText.textContent = "מתנגן";

    playRing.style.animation = "none";
    void playRing.offsetWidth;
    playRing.style.animation = "ringDeplete " + CLIP_SECONDS + "s linear forwards";

    var remaining = CLIP_SECONDS;
    playCount.textContent = String(remaining);
    if (state.countdownInterval) { clearInterval(state.countdownInterval); }
    state.countdownInterval = setInterval(function () {
      remaining--;
      if (remaining >= 1) {
        playCount.textContent = String(remaining);
      }
    }, 1000);

    if (state.playTimeout) { clearTimeout(state.playTimeout); }
    state.playTimeout = setTimeout(function () {
      if (myToken === state.clipToken) {
        stopClip();
      }
    }, CLIP_SECONDS * 1000);
  }

  function loadSong(index) {
    var song = SONGS[index];
    state.currentIndex = index;
    state.hintsShown = 0;
    answerInput.value = "";
    feedback.textContent = "";
    feedback.className = "feedback";
    hintsList.innerHTML = "";
    hintsLeftEl.textContent = String(MAX_HINTS);
    hintBtn.disabled = false;
    songCounter.textContent = "שיר " + (index + 1) + "/" + SONGS.length;
    progressFill.style.width = ((index) / SONGS.length * 100) + "%";
    resetClipTimers();
    state.clipToken++;

    // הכפתור תמיד מוכן ולחיץ. אם האודיו כבר טעון מראש — הניגון מיידי;
    // אחרת הלחיצה עצמה (מחווה) מתחילה את הניגון תוך רגע.
    setPlayState("ready");

    answerInput.focus({ preventScroll: true });
  }

  function playClip() {
    var song = SONGS[state.currentIndex];
    var a = currentAudio();
    if (!a) {
      return;
    }
    // עצירת שאר השירים
    state.audios.forEach(function (aa, idx) {
      if (idx !== state.currentIndex && aa) { try { aa.pause(); } catch (e) {} }
    });

    resetClipTimers();
    state.clipToken++;
    var myToken = state.clipToken;

    try {
      a.muted = false;
      a.currentTime = song.clipStart || 0;
      var p = a.play();
      if (p && p.catch) { p.catch(function () {}); }
    } catch (e) {}

    // האודיו טעון מראש — הניגון מיידי, אז מפעילים את החיווי מיד.
    armClip(myToken);
  }

  function acceptedAnswers(song) {
    var variants = [song.title];
    if (song.artist) {
      variants.push(song.artist + " " + song.title);
      variants.push(song.title + " " + song.artist);
    }
    if (song.answers) {
      variants = variants.concat(song.answers);
    }
    return variants.map(normalize);
  }

  function handleAnswerSubmit(e) {
    e.preventDefault();
    var song = SONGS[state.currentIndex];
    var guess = normalize(answerInput.value);

    if (!guess) {
      return;
    }

    if (acceptedAnswers(song).indexOf(guess) !== -1) {
      feedback.textContent = "✔ נכון! כל הכבוד";
      feedback.className = "feedback correct pop";
      songScreen.querySelector(".card").classList.add("pop");
      setTimeout(function () {
        songScreen.querySelector(".card").classList.remove("pop");
        goToNextSong();
      }, 900);
    } else {
      feedback.textContent = "✗ לא בדיוק, נסה שוב";
      feedback.className = "feedback wrong shake";
      answerInput.classList.add("shake");
      setTimeout(function () {
        answerInput.classList.remove("shake");
      }, 400);
    }
  }

  function showNextHint() {
    var song = SONGS[state.currentIndex];
    if (state.hintsShown >= MAX_HINTS || state.hintsShown >= song.hints.length) {
      return;
    }
    var li = document.createElement("li");
    li.textContent = song.hints[state.hintsShown];
    hintsList.appendChild(li);
    state.hintsShown++;
    hintsLeftEl.textContent = String(MAX_HINTS - state.hintsShown);
    if (state.hintsShown >= MAX_HINTS) {
      hintBtn.disabled = true;
    }
  }

  function goToNextSong() {
    stopClip();
    var next = state.currentIndex + 1;
    if (next >= SONGS.length) {
      progressFill.style.width = "100%";
      showScreen(endScreen);
    } else {
      loadSong(next);
      showScreen(songScreen);
    }
  }

  function startGame() {
    state.gameStarted = true;
    state.currentIndex = 0;
    loadSong(0);
    showScreen(songScreen);
  }

  function openGift() {
    if (giftBox.classList.contains("opened")) {
      return;
    }
    giftBox.classList.add("opened");
    setTimeout(function () {
      giftBox.classList.add("hidden-after-open");
    }, 500);
    prizeReveal.classList.remove("hidden");
    launchConfetti();
  }

  function launchConfetti() {
    var container = document.getElementById("confetti-container");
    var colors = ["#ffe066", "#ffb800", "#fff4c2", "#ffffff", "#1c2140"];
    var pieceCount = 90;
    for (var i = 0; i < pieceCount; i++) {
      var piece = document.createElement("div");
      piece.className = "confetti-piece";
      var size = 6 + Math.random() * 6;
      piece.style.width = size + "px";
      piece.style.height = (size * 0.4) + "px";
      piece.style.left = (Math.random() * 100) + "vw";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      var duration = 2.5 + Math.random() * 2;
      piece.style.animationDuration = duration + "s";
      piece.style.animationDelay = (Math.random() * 0.6) + "s";
      container.appendChild(piece);
      (function (el, totalTime) {
        setTimeout(function () {
          el.remove();
        }, totalTime * 1000 + 700);
      })(piece, duration);
    }
  }

  startBtn.addEventListener("click", startGame);
  playBtn.addEventListener("click", playClip);
  answerForm.addEventListener("submit", handleAnswerSubmit);
  hintBtn.addEventListener("click", showNextHint);
  giftBox.addEventListener("click", openGift);
  giftBox.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openGift();
    }
  });

  createAudios();
})();
