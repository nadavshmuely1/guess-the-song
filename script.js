(function () {
  "use strict";

  var CLIP_SECONDS = 5;
  var MAX_HINTS = 4;

  var state = {
    currentIndex: 0,
    hintsShown: 0,
    player: null,
    playerReady: false,
    playTimeout: null,
    clipToken: 0,
    awaitingPlayToken: null
  };

  var introScreen = document.getElementById("intro-screen");
  var songScreen = document.getElementById("song-screen");
  var endScreen = document.getElementById("end-screen");

  var startBtn = document.getElementById("start-btn");
  var playBtn = document.getElementById("play-btn");
  var songCounter = document.getElementById("song-counter");
  var progressFill = document.getElementById("progress-fill");
  var answerForm = document.getElementById("answer-form");
  var answerInput = document.getElementById("answer-input");
  var feedback = document.getElementById("feedback");
  var hintBtn = document.getElementById("hint-btn");
  var hintsLeftEl = document.getElementById("hints-left");
  var hintsList = document.getElementById("hints-list");
  var giftBox = document.getElementById("gift-box");
  var prizeText = document.getElementById("prize-text");

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
    playBtn.classList.remove("playing");
    state.clipToken++;
    state.awaitingPlayToken = null;
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
      state.playTimeout = null;
    }

    if (state.playerReady && state.player && typeof state.player.cueVideoById === "function") {
      state.player.cueVideoById({ videoId: song.videoId, startSeconds: song.startSeconds });
    }

    answerInput.focus({ preventScroll: true });
  }

  function playClip() {
    var song = SONGS[state.currentIndex];
    if (!state.playerReady || !state.player) {
      return;
    }
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
      state.playTimeout = null;
    }
    state.clipToken++;
    state.awaitingPlayToken = state.clipToken;
    playBtn.classList.add("playing");
    state.player.seekTo(song.startSeconds, true);
    state.player.playVideo();
  }

  function handlePlayerStateChange(event) {
    if (event.data !== YT.PlayerState.PLAYING) {
      return;
    }
    if (state.awaitingPlayToken === null) {
      return;
    }
    var myToken = state.awaitingPlayToken;
    state.awaitingPlayToken = null;
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
    }
    state.playTimeout = setTimeout(function () {
      if (myToken === state.clipToken) {
        state.player.pauseVideo();
        playBtn.classList.remove("playing");
      }
      state.playTimeout = null;
    }, CLIP_SECONDS * 1000);
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
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
      state.playTimeout = null;
    }
    if (state.player && typeof state.player.pauseVideo === "function") {
      state.player.pauseVideo();
    }
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
    state.currentIndex = 0;
    loadSong(0);
    showScreen(songScreen);
  }

  function openGift() {
    if (giftBox.classList.contains("opened")) {
      return;
    }
    giftBox.classList.add("opened");
    prizeText.classList.remove("hidden");
    launchConfetti();
  }

  function launchConfetti() {
    var container = document.getElementById("confetti-container");
    var colors = ["#6c5ce7", "#fd79a8", "#ffeaa7", "#00b894", "#ff9ff3", "#74b9ff"];
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
        },
        onStateChange: handlePlayerStateChange
      }
    });
  };
})();
