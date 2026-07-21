(function () {
  "use strict";

  var CLIP_SECONDS = 5;
  var MAX_HINTS = 4;

  var state = {
    currentIndex: 0,
    hintsShown: 0,
    player: null,
    playerReady: false,
    gameStarted: false,
    songReady: false,
    cuedVideoId: null,
    playTimeout: null,
    countdownInterval: null,
    clipToken: 0,
    awaitingPlayToken: null,
    armedToken: null
  };

  var introScreen = document.getElementById("intro-screen");
  var songScreen = document.getElementById("song-screen");
  var endScreen = document.getElementById("end-screen");

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
    [introScreen, songScreen, endScreen].forEach(function (s) {
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

  // מצבי הכפתור: "loading" = ספינר בזמן טעינת השיר, "ready" = מוכן להשמעה,
  // "error" = הסרטון לא נטען (שגיאת יוטיוב).
  function setPlayState(mode) {
    state.songReady = (mode === "ready");
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
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
      state.playTimeout = null;
    }
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
    state.armedToken = null;
    playBtn.classList.remove("playing");
    playCount.textContent = "";
  }

  function stopClip() {
    resetClipTimers();
    if (state.songReady) {
      playText.textContent = "השמע";
    }
    if (state.player && typeof state.player.pauseVideo === "function") {
      state.player.pauseVideo();
    }
  }

  // מפעיל את חיווי הניגון (טבעת מתרוקנת + ספירת שניות) ומתזמן עצירה אחרי 5 שניות.
  // מוגן כך שכל לחיצה על "השמע" מפעיל אותו פעם אחת בלבד (armedToken).
  function armClip(myToken) {
    if (state.armedToken === myToken) {
      return;
    }
    state.armedToken = myToken;
    state.awaitingPlayToken = null;

    playBtn.classList.add("playing");
    playText.textContent = "מתנגן";

    // איפוס והפעלה מחדש של אנימציית הטבעת (5 שניות, מתרוקנת).
    playRing.style.animation = "none";
    void playRing.offsetWidth;
    playRing.style.animation = "ringDeplete " + CLIP_SECONDS + "s linear forwards";

    // ספירת שניות 5..1
    var remaining = CLIP_SECONDS;
    playCount.textContent = String(remaining);
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
    }
    state.countdownInterval = setInterval(function () {
      remaining--;
      if (remaining >= 1) {
        playCount.textContent = String(remaining);
      }
    }, 1000);

    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
    }
    state.playTimeout = setTimeout(function () {
      if (myToken === state.clipToken) {
        stopClip();
      }
    }, CLIP_SECONDS * 1000);
  }

  function loadSong(index) {
    var song = SONGS[index];
    state.hintsShown = 0;
    answerInput.value = "";
    feedback.textContent = "";
    feedback.className = "feedback";
    hintsList.innerHTML = "";
    hintsLeftEl.textContent = String(MAX_HINTS);
    hintBtn.disabled = false;
    songCounter.textContent = "שיר " + (index + 1) + "/" + SONGS.length;
    progressFill.style.width = ((index) / SONGS.length * 100) + "%";
    stopClip();
    state.clipToken++;
    state.awaitingPlayToken = null;

    // אם השיר הזה כבר טעון ומוכן (למשל שיר 1 שנטען מראש במסך הפתיחה) —
    // לא צריך לטעון שוב, הכפתור מוכן מיידית.
    if (state.cuedVideoId === song.videoId && state.songReady) {
      setPlayState("ready");
    } else if (state.playerReady && state.player && typeof state.player.cueVideoById === "function") {
      setPlayState("loading");
      state.cuedVideoId = song.videoId;
      state.player.cueVideoById({ videoId: song.videoId, startSeconds: song.startSeconds });
    } else {
      setPlayState("loading");
    }

    answerInput.focus({ preventScroll: true });
  }

  function playClip() {
    var song = SONGS[state.currentIndex];
    if (!state.playerReady || !state.player || !state.songReady) {
      return;
    }
    // האם השיר כבר מתנגן ברגע הלחיצה (לחיצה חוזרת)?
    var alreadyPlaying = typeof state.player.getPlayerState === "function" &&
      state.player.getPlayerState() === YT.PlayerState.PLAYING;
    // איפוס מונים/חיווי בלי לעצור את הנגן (נעצור ממילא בעוד רגע ע"י ניגון חדש).
    resetClipTimers();
    state.clipToken++;
    var myToken = state.clipToken;
    state.awaitingPlayToken = myToken;
    state.player.seekTo(song.startSeconds, true);
    state.player.playVideo();
    // לחיצה חוזרת בזמן ניגון: יוטיוב לא ישלח PLAYING חדש, אז מדליקים חיווי מיד.
    if (alreadyPlaying) {
      armClip(myToken);
    }
    // רשת ביטחון: אם הדפדפן חסם את הניגון (autoplay), מנסים שוב.
    setTimeout(function () {
      if (state.clipToken === myToken && state.armedToken !== myToken) {
        state.player.playVideo();
      }
    }, 250);
    // מפעילים את החיווי לכל היותר תוך חצי שנייה — גם אם יוטיוב לא שלח
    // אירוע PLAYING חדש (למשל בלחיצה חוזרת בזמן שהשיר כבר מתנגן).
    setTimeout(function () {
      if (state.clipToken === myToken && state.armedToken !== myToken) {
        armClip(myToken);
      }
    }, 500);
  }

  function handlePlayerStateChange(event) {
    if (event.data === YT.PlayerState.CUED) {
      state.songReady = true;
      // מפעילים את הכפתור רק אם אנחנו במסך שיר (לא בזמן טעינה-מראש בפתיחה).
      if (songScreen.classList.contains("active")) {
        setPlayState("ready");
      }
      return;
    }
    if (event.data === YT.PlayerState.PLAYING && state.awaitingPlayToken !== null) {
      armClip(state.awaitingPlayToken);
    }
  }

  function handlePlayerError() {
    // הסרטון לא ניתן לטעינה/הטמעה. לא נתקעים על "טוען" — מציגים שגיאה.
    if (songScreen.classList.contains("active")) {
      stopClip();
      setPlayState("error");
      feedback.textContent = "לא ניתן לנגן את השיר הזה כרגע 😕";
      feedback.className = "feedback wrong";
    }
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
    state.currentIndex++;
    if (state.currentIndex >= SONGS.length) {
      progressFill.style.width = "100%";
      showScreen(endScreen);
    } else {
      loadSong(state.currentIndex);
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

  // YouTube IFrame API
  window.onYouTubeIframeAPIReady = function () {
    state.player = new YT.Player("yt-player", {
      height: "0",
      width: "0",
      videoId: SONGS[0].videoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1
      },
      events: {
        onReady: function () {
          state.playerReady = true;
          if (state.gameStarted) {
            loadSong(state.currentIndex);
          } else {
            // טעינה מראש של שיר 1 כבר במסך הפתיחה, כדי שיהיה מוכן מיידית
            // כשלוחצים "התחל" (מסתיר את זמן ה-cold start).
            state.cuedVideoId = SONGS[0].videoId;
            state.player.cueVideoById({
              videoId: SONGS[0].videoId,
              startSeconds: SONGS[0].startSeconds
            });
          }
        },
        onStateChange: handlePlayerStateChange,
        onError: handlePlayerError
      }
    });
  };
})();
