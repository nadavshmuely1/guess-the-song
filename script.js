(function () {
  "use strict";

  var CLIP_SECONDS = 5;
  var MAX_HINTS = 4;
  var LOADING_TIMEOUT_MS = 12000; // גבול זמן למסך הטעינה (שלא ייתקע לנצח)
  var START_WAIT_MS = 4500;       // כמה לחכות לניגון אמיתי אחרי לחיצה לפני חזרה ל"השמע"
                                  // (ארוך מזמן אגירה טיפוסי כדי לא לרצד)

  var state = {
    currentIndex: 0,
    hintsShown: 0,
    players: [],        // נגן YouTube נפרד לכל שיר
    playerReady: [],    // האם הנגן של שיר i טעון (CUED) ומוכן לניגון
    readyCount: 0,
    songReady: false,
    gameStarted: false,
    loadingDone: false,
    playTimeout: null,
    startTimeout: null,
    countdownInterval: null,
    clipToken: 0,
    awaitingPlayToken: null,
    armedToken: null
  };

  var loadingScreen = document.getElementById("loading-screen");
  var introScreen = document.getElementById("intro-screen");
  var songScreen = document.getElementById("song-screen");
  var endScreen = document.getElementById("end-screen");

  var loadingBarFill = document.getElementById("loading-bar-fill");
  var loadingCount = document.getElementById("loading-count");
  var playerWrap = document.getElementById("yt-player-wrap");

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

  function currentPlayer() {
    return state.players[state.currentIndex];
  }

  // ===================== טעינה מקבילה של כל השירים =====================

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

  function markPlayerReady(i) {
    if (!state.playerReady[i]) {
      state.playerReady[i] = true;
      state.readyCount++;
      updateLoadingProgress();
      if (state.readyCount >= SONGS.length) {
        finishLoading();
      }
    }
  }

  function handleStateChange(i, event) {
    // כשהנגן טעון (CUED) — מסמנים אותו מוכן. במהלך הטעינה זה מקדם את מסך
    // הטעינה; במסך השיר זה מפעיל את כפתור "השמע".
    if (event.data === YT.PlayerState.CUED) {
      markPlayerReady(i);
      if (state.gameStarted && i === state.currentIndex &&
          songScreen.classList.contains("active")) {
        setPlayState("ready");
      }
      return;
    }
    // מתחילים את הסטופר רק כשהשיר של המסך הנוכחי באמת מתנגן.
    if (event.data === YT.PlayerState.PLAYING &&
        state.gameStarted &&
        i === state.currentIndex &&
        state.awaitingPlayToken !== null) {
      armClip(state.awaitingPlayToken);
    }
  }

  function handleError(i, event) {
    // סרטון שלא ניתן לטעינה/הטמעה: מסמנים "מוכן" כדי לא לתקוע את מסך הטעינה.
    markPlayerReady(i);
    if (i === state.currentIndex && songScreen.classList.contains("active")) {
      stopClip();
      setPlayState("error");
      feedback.textContent = "לא ניתן לנגן את השיר הזה כרגע 😕";
      feedback.className = "feedback wrong";
    }
  }

  function createAllPlayers() {
    SONGS.forEach(function (song, i) {
      var div = document.createElement("div");
      div.id = "yt-player-" + i;
      playerWrap.appendChild(div);
      state.playerReady[i] = false;
      state.players[i] = new YT.Player(div, {
        height: "0",
        width: "0",
        videoId: song.videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: (function (idx, s) {
            return function () {
              try {
                state.players[idx].cueVideoById({
                  videoId: s.videoId,
                  startSeconds: s.startSeconds
                });
              } catch (e) {}
            };
          })(i, song),
          onStateChange: (function (idx) {
            return function (e) { handleStateChange(idx, e); };
          })(i),
          onError: (function (idx) {
            return function (e) { handleError(idx, e); };
          })(i)
        }
      });
    });
  }

  // ===================== כפתור ההשמעה =====================

  function setPlayState(mode) {
    state.songReady = (mode === "ready");
    playBtn.classList.remove("starting");
    playBtn.classList.toggle("loading", mode === "loading");
    playBtn.disabled = (mode !== "ready");
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
    if (state.startTimeout) { clearTimeout(state.startTimeout); state.startTimeout = null; }
    if (state.countdownInterval) { clearInterval(state.countdownInterval); state.countdownInterval = null; }
    state.armedToken = null;
    playBtn.classList.remove("playing");
    playBtn.classList.remove("starting");
    playCount.textContent = "";
  }

  function stopClip() {
    resetClipTimers();
    if (state.songReady) {
      playText.textContent = "השמע";
    }
    var p = currentPlayer();
    if (p && typeof p.pauseVideo === "function") {
      try { p.pauseVideo(); } catch (e) {}
    }
  }

  // מפעיל את חיווי הניגון (טבעת מתרוקנת + ספירת שניות) ומתזמן עצירה אחרי 5 שניות.
  // נקרא רק כשידוע שהשיר באמת מתנגן (אירוע PLAYING או ניגון קיים בלחיצה חוזרת).
  function armClip(myToken) {
    if (state.armedToken === myToken) {
      return;
    }
    state.armedToken = myToken;
    state.awaitingPlayToken = null;
    if (state.startTimeout) { clearTimeout(state.startTimeout); state.startTimeout = null; }

    playBtn.classList.remove("starting");
    playBtn.classList.add("playing");
    playText.textContent = "מתנגן";

    // איפוס והפעלה מחדש של אנימציית הטבעת (5 שניות, מתרוקנת).
    playRing.style.animation = "none";
    void playRing.offsetWidth;
    playRing.style.animation = "ringDeplete " + CLIP_SECONDS + "s linear forwards";

    // ספירת שניות 5..1
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
    // איפוס חיווי בלבד — לא עוצרים כאן את הנגן (הנגן החדש ממילא לא מנגן,
    // והנגן הקודם כבר נעצר ב-goToNextSong). מונע מרוץ pause→play.
    resetClipTimers();
    state.clipToken++;
    state.awaitingPlayToken = null;

    // הנגן כבר נטען מראש — הכפתור מוכן מיידית. אם עדיין לא (נדיר), מציג "טוען".
    if (state.playerReady[index]) {
      setPlayState("ready");
    } else {
      setPlayState("loading");
    }

    answerInput.focus({ preventScroll: true });
  }

  function playClip() {
    var song = SONGS[state.currentIndex];
    var p = currentPlayer();
    if (!p || !state.playerReady[state.currentIndex]) {
      return;
    }
    // עצירת כל שאר הנגנים כדי שלא ינגנו במקביל.
    state.players.forEach(function (pp, idx) {
      if (idx !== state.currentIndex && pp && typeof pp.pauseVideo === "function") {
        try { pp.pauseVideo(); } catch (e) {}
      }
    });

    var wasPlaying = typeof p.getPlayerState === "function" &&
      p.getPlayerState() === YT.PlayerState.PLAYING;

    resetClipTimers();
    state.clipToken++;
    var myToken = state.clipToken;
    state.awaitingPlayToken = myToken;

    // חיווי "רגע..." — הלחיצה נקלטה, אבל הסטופר לא מתחיל עד שיש ניגון אמיתי.
    playBtn.classList.add("starting");
    playText.textContent = "רגע...";

    try {
      p.unMute();
      p.seekTo(song.startSeconds, true);
      p.playVideo();
    } catch (e) {}

    // לחיצה חוזרת בזמן שהשיר כבר מתנגן: אין PLAYING חדש, אבל זה ניגון אמיתי.
    if (wasPlaying) {
      armClip(myToken);
    }

    // ניסיון נוסף אם הדפדפן חסם autoplay.
    setTimeout(function () {
      if (state.clipToken === myToken && state.armedToken !== myToken) {
        try { p.playVideo(); } catch (e) {}
      }
    }, 300);

    // אם לא התחיל ניגון אמיתי תוך זמן סביר (למשל לחיצה ראשונה בטלפון שלא
    // "תפסה") — חוזרים ל"השמע" כדי שאפשר יהיה ללחוץ שוב. הסטופר לא רץ.
    state.startTimeout = setTimeout(function () {
      if (state.clipToken === myToken && state.armedToken !== myToken) {
        playBtn.classList.remove("starting");
        if (state.playerReady[state.currentIndex]) {
          setPlayState("ready");
        }
      }
    }, START_WAIT_MS);
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

  // גבול זמן כללי: גם אם משהו בטעינה נתקע, פותחים את המשחק.
  setTimeout(finishLoading, LOADING_TIMEOUT_MS);

  // YouTube IFrame API — אם כבר נטען (מ-cache) יוצרים מיד, אחרת ממתינים ל-callback.
  function onApiReady() {
    createAllPlayers();
  }
  if (window.YT && window.YT.Player) {
    onApiReady();
  } else {
    window.onYouTubeIframeAPIReady = onApiReady;
  }
})();
