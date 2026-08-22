// ---- 상태 ----
const state = {
  totalPlannedSeconds: 0,
  routines: [], // { minutes, name }
  currentIndex: -1,
  totalElapsedSeconds: 0,
  currentRemainingSeconds: 0,
  waitingForNext: false,
  tickHandle: null,
  sessionStartAt: 0, // 연습 시작 시각(ms) — 총 경과 시간 계산 기준
  routineEndAt: 0, // 현재 루틴이 끝나야 하는 시각(ms)
  builderInitialized: false, // 루틴 구성 화면이 이번 세션에서 이미 채워졌는지 여부
};

const SAVED_ROUTINES_KEY = "guitarRoutine.lastRoutines";
const HIDE_RESTORE_PROMPT_KEY = "guitarRoutine.hideRestorePrompt";

const SETUP_MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50];

function getRoutineMinuteOptions() {
  const totalMinutes = Math.round(state.totalPlannedSeconds / 60);
  const options = [];
  for (let m = 10; m <= totalMinutes; m += 10) options.push(m);
  return options;
}

const ROUTINE_GLOSSARY = [
  ["크로매틱", "손가락을 한 칸씩 순서대로 짚으며 프렛을 오가는 기초 연습입니다. 손가락의 힘과 정확도를 길러줍니다."],
  ["스케일", "정해진 음 순서(음계)를 오르내리며 손가락 위치와 음감을 익히는 연습입니다."],
  ["코드", "여러 줄을 동시에 눌러 화음을 만드는 연습입니다."],
  ["아르페지오", "코드를 한 번에 치지 않고 한 음씩 순서대로 뜯어 연주하는 연습입니다."],
  ["스트로크", "피크나 손가락으로 여러 줄을 쓸어내리거나 올리며 리듬을 타는 연습입니다."],
  ["리듬", "박자에 맞춰 정확하게 연주하는 감각을 기르는 연습입니다."],
  ["튜닝", "기타 줄의 음정을 정확히 맞추는 작업입니다."],
  ["핑거링", "손가락으로 프렛을 정확하게 짚는 연습입니다."],
  ["핑거스타일", "피크 없이 손가락만으로 멜로디와 반주를 함께 연주하는 연습입니다."],
  ["곡 카피", "좋아하는 곡을 듣고 그대로 따라 연주해보는 연습입니다."],
  ["즉흥", "정해진 악보 없이 자유롭게 연주해보는 연습입니다."],
];

function getRoutineDescription(name) {
  const exact = ROUTINE_GLOSSARY.find(([term]) => term === name);
  if (exact) return exact[1];
  const partial = ROUTINE_GLOSSARY.find(([term]) => name.includes(term) || term.includes(name));
  if (partial) return partial[1];
  return "이 시간 동안 루틴에 집중해서 연습해보세요.";
}

// ---- DOM ----
const setupHours = document.getElementById("setup-hours");
const setupMinutes = document.getElementById("setup-minutes");
const setupMinutesField = document.getElementById("setup-minutes-field");
const goBuilderBtn = document.getElementById("go-builder-btn");
const beginnerBtn = document.getElementById("beginner-btn");

const builderTotalTime = document.getElementById("builder-total-time");
const routineList = document.getElementById("routine-list");
const addRoutineBtn = document.getElementById("add-routine-btn");
const routineSumEl = document.getElementById("routine-sum");
const overageWarning = document.getElementById("overage-warning");
const filledNotice = document.getElementById("filled-notice");
const backToSetupBtn = document.getElementById("back-to-setup-btn");
const startBtn = document.getElementById("start-btn");

const restoreModal = document.getElementById("restore-modal");
const restoreYesBtn = document.getElementById("restore-yes-btn");
const restoreNoBtn = document.getElementById("restore-no-btn");
const restoreNeverBtn = document.getElementById("restore-never-btn");

const beginnerConfirmModal = document.getElementById("beginner-confirm-modal");
const beginnerConfirmYesBtn = document.getElementById("beginner-confirm-yes-btn");
const beginnerConfirmNoBtn = document.getElementById("beginner-confirm-no-btn");

const totalElapsedEl = document.getElementById("total-elapsed");
const totalPlannedEl = document.getElementById("total-planned");
const timerOverage = document.getElementById("timer-overage");
const timerScreen = document.getElementById("timer-screen");
const currentRoutineName = document.getElementById("current-routine-name");
const currentRoutineDesc = document.getElementById("current-routine-desc");
const currentRoutineTime = document.getElementById("current-routine-time");
const progressFill = document.getElementById("progress-fill");
const stopBtn = document.getElementById("stop-btn");
const skipRoutineBtn = document.getElementById("skip-routine-btn");

const nextRoutineOverlay = document.getElementById("next-routine-overlay");
const nextPreview = document.getElementById("next-preview");
const nextRoutineBtn = document.getElementById("next-routine-btn");
const finishOverlay = document.getElementById("finish-overlay");
const restartBtn = document.getElementById("restart-btn");

const skipConfirmModal = document.getElementById("skip-confirm-modal");
const skipYesBtn = document.getElementById("skip-yes-btn");
const skipNoBtn = document.getElementById("skip-no-btn");

// ---- 화면 전환 ----
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// ---- 시간 포맷 ----
function formatTime(totalSeconds) {
  totalSeconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatMinutesLabel(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

// ---- 분 단위 빠른 선택 드롭다운 ----
// getOptions: 드롭다운을 열 때마다 호출되어 현재 옵션 목록을 반환하는 함수
// (총 연습 시간이 바뀐 뒤에도 항상 최신 값을 반영하기 위함)
function attachMinuteDropdown(container, input, getOptions) {
  const dropdown = document.createElement("div");
  dropdown.className = "minute-dropdown";
  container.appendChild(dropdown);

  function rebuildOptions() {
    dropdown.innerHTML = "";
    getOptions().forEach((val) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.textContent = `${val}분`;
      opt.addEventListener("click", () => {
        input.value = val;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        dropdown.classList.remove("show");
      });
      dropdown.appendChild(opt);
    });
  }

  let hideTimer = null;
  container.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
    rebuildOptions();
    dropdown.classList.add("show");
  });
  container.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(() => dropdown.classList.remove("show"), 150);
  });
}

attachMinuteDropdown(setupMinutesField, setupMinutes, () => SETUP_MINUTE_OPTIONS);

// ---- 루틴 입력 행 ----
function addRoutineRow(minutes = "", name = "") {
  const row = document.createElement("div");
  row.className = "routine-row";
  row.innerHTML = `
    <div class="minute-field">
      <input type="number" class="routine-minutes" min="1" placeholder="분" value="${minutes}" />
    </div>
    <span class="unit">분</span>
    <input type="text" class="routine-name" placeholder="루틴 이름" value="${name}" />
    <button type="button" class="remove-row-btn" aria-label="삭제">✕</button>
  `;
  routineList.appendChild(row);

  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    row.remove();
    updateSum();
  });
  const minutesInput = row.querySelector(".routine-minutes");
  minutesInput.addEventListener("input", updateSum);
  attachMinuteDropdown(row.querySelector(".minute-field"), minutesInput, getRoutineMinuteOptions);
}

function clearRoutineRows() {
  routineList.innerHTML = "";
}

function updateSum() {
  const minuteInputs = document.querySelectorAll(".routine-minutes");
  let sum = 0;
  minuteInputs.forEach((inp) => (sum += Number(inp.value) || 0));
  routineSumEl.textContent = formatMinutesLabel(sum);

  const totalMinutes = Math.round(state.totalPlannedSeconds / 60);
  overageWarning.classList.toggle("hidden", sum <= totalMinutes);
  filledNotice.classList.toggle("hidden", sum !== totalMinutes || totalMinutes === 0);
  addRoutineBtn.disabled = sum >= totalMinutes;
}

// ---- 이전 루틴 저장/불러오기 ----
function getSavedRoutines() {
  try {
    const raw = localStorage.getItem(SAVED_ROUTINES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveRoutines(routines) {
  try {
    localStorage.setItem(SAVED_ROUTINES_KEY, JSON.stringify(routines));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

function startFreshBuilder() {
  clearRoutineRows();
  addRoutineRow();
  updateSum();
  state.builderInitialized = true;
}

// ---- 화면 1 -> 화면 2 ----
function setTotalPlannedFromSetup() {
  const hours = Number(setupHours.value) || 0;
  const minutes = Number(setupMinutes.value) || 0;
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes <= 0) {
    alert("연습할 시간을 입력해주세요.");
    return false;
  }

  state.totalPlannedSeconds = totalMinutes * 60;
  builderTotalTime.textContent = formatMinutesLabel(totalMinutes);
  return true;
}

goBuilderBtn.addEventListener("click", () => {
  if (!setTotalPlannedFromSetup()) return;
  showScreen("builder-screen");

  if (state.builderInitialized) {
    // 루틴을 입력하다가 뒤로 갔다 온 경우 — 입력하던 내용을 그대로 유지
    updateSum();
    return;
  }

  const saved = getSavedRoutines();
  const hidePrompt = localStorage.getItem(HIDE_RESTORE_PROMPT_KEY) === "1";

  if (saved && !hidePrompt) {
    restoreModal.classList.remove("hidden");
    return;
  }
  startFreshBuilder();
});

restoreYesBtn.addEventListener("click", () => {
  restoreModal.classList.add("hidden");
  const saved = getSavedRoutines();
  clearRoutineRows();
  if (saved) {
    saved.forEach((r) => addRoutineRow(r.minutes, r.name));
  }
  if (routineList.children.length === 0) addRoutineRow();
  updateSum();
  state.builderInitialized = true;
});

restoreNoBtn.addEventListener("click", () => {
  restoreModal.classList.add("hidden");
  startFreshBuilder();
});

restoreNeverBtn.addEventListener("click", () => {
  try {
    localStorage.setItem(HIDE_RESTORE_PROMPT_KEY, "1");
  } catch {
    // 무시
  }
  restoreModal.classList.add("hidden");
  startFreshBuilder();
});

function applyBeginnerRoutine() {
  setupHours.value = 1;
  setupMinutes.value = 0;
  if (!setTotalPlannedFromSetup()) return;
  showScreen("builder-screen");
  restoreModal.classList.add("hidden");
  clearRoutineRows();
  addRoutineRow(10, "크로매틱");
  addRoutineRow(20, "스케일 연습");
  addRoutineRow(30, "곡 카피");
  updateSum();
  state.builderInitialized = true;
}

beginnerBtn.addEventListener("click", () => {
  // 작성 중이던 루틴이 있다면 덮어쓰기 전에 먼저 확인한다.
  if (state.builderInitialized) {
    beginnerConfirmModal.classList.remove("hidden");
    return;
  }
  applyBeginnerRoutine();
});

beginnerConfirmYesBtn.addEventListener("click", () => {
  beginnerConfirmModal.classList.add("hidden");
  applyBeginnerRoutine();
});

beginnerConfirmNoBtn.addEventListener("click", () => {
  beginnerConfirmModal.classList.add("hidden");
});

addRoutineBtn.addEventListener("click", () => addRoutineRow());

backToSetupBtn.addEventListener("click", () => showScreen("setup-screen"));

// ---- 화면 2 -> 화면 3 ----
startBtn.addEventListener("click", () => {
  const rows = [...document.querySelectorAll(".routine-row")];
  const routines = rows.map((row) => ({
    minutes: Number(row.querySelector(".routine-minutes").value) || 0,
    name: row.querySelector(".routine-name").value.trim(),
  }));

  if (routines.length === 0 || routines.some((r) => r.minutes <= 0 || !r.name)) {
    alert("모든 루틴에 시간과 이름을 입력해주세요.");
    return;
  }

  saveRoutines(routines);

  state.routines = routines;
  state.currentIndex = 0;
  state.totalElapsedSeconds = 0;
  state.sessionStartAt = Date.now();

  totalPlannedEl.textContent = formatTime(state.totalPlannedSeconds);
  totalElapsedEl.textContent = formatTime(0);
  timerOverage.classList.add("hidden");

  initAudio();
  showScreen("timer-screen");
  startRoutineTimer(0);
  startTicking();
});

// ---- 타이머 ----
// 경과 시간을 누적하는 대신, "몇 시 몇 분에 끝나야 하는가"라는 목표 시각을 기준으로 계산한다.
// 다른 탭을 보다가 돌아와 setInterval이 밀렸더라도, 다음 갱신 시점에 실제 시각과
// 다시 맞춰지므로 타이머가 뒤로 밀리지 않는다.
function startRoutineTimer(index) {
  if (index >= state.routines.length) {
    finishPractice();
    return;
  }
  const routine = state.routines[index];
  state.routineEndAt = Date.now() + routine.minutes * 60 * 1000;
  state.currentRemainingSeconds = routine.minutes * 60;
  state.waitingForNext = false;
  currentRoutineName.textContent = routine.name;
  currentRoutineDesc.textContent = getRoutineDescription(routine.name);
  updateRoutineDisplay(routine.minutes * 60);
}

function updateRoutineDisplay(totalSecondsForRoutine) {
  currentRoutineTime.textContent = formatTime(state.currentRemainingSeconds);
  const elapsedInRoutine = totalSecondsForRoutine - state.currentRemainingSeconds;
  const pct = totalSecondsForRoutine > 0 ? (elapsedInRoutine / totalSecondsForRoutine) * 100 : 100;
  progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

function startTicking() {
  if (state.tickHandle) clearInterval(state.tickHandle);
  state.tickHandle = setInterval(updateClock, 1000);
}

function stopTicking() {
  if (state.tickHandle) {
    clearInterval(state.tickHandle);
    state.tickHandle = null;
  }
}

function updateClock() {
  const now = Date.now();

  state.totalElapsedSeconds = Math.max(0, Math.floor((now - state.sessionStartAt) / 1000));
  totalElapsedEl.textContent = formatTime(state.totalElapsedSeconds);
  timerOverage.classList.toggle("hidden", state.totalElapsedSeconds <= state.totalPlannedSeconds);

  if (!state.waitingForNext) {
    const remainingMs = state.routineEndAt - now;
    state.currentRemainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const routine = state.routines[state.currentIndex];
    updateRoutineDisplay(routine.minutes * 60);

    if (remainingMs <= 0) {
      state.waitingForNext = true;
      playAlarm();
      triggerShake();
      showNextPrompt();
    }
  }
}

// 다른 탭에 있다가 돌아오면 setInterval을 기다리지 않고 즉시 화면을 최신 상태로 맞춘다.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.tickHandle) {
    updateClock();
  }
});

function showNextPrompt() {
  const next = state.routines[state.currentIndex + 1];
  if (next) {
    nextPreview.textContent = `다음: ${next.name} (${next.minutes}분)`;
    nextRoutineOverlay.classList.remove("hidden");
  } else {
    stopTicking();
    finishOverlay.classList.remove("hidden");
  }
}

function advanceToNextRoutine() {
  state.currentIndex++;
  startRoutineTimer(state.currentIndex);
}

nextRoutineBtn.addEventListener("click", () => {
  nextRoutineOverlay.classList.add("hidden");
  advanceToNextRoutine();
});

skipRoutineBtn.addEventListener("click", () => {
  skipConfirmModal.classList.remove("hidden");
});

skipYesBtn.addEventListener("click", () => {
  skipConfirmModal.classList.add("hidden");
  advanceToNextRoutine();
});

skipNoBtn.addEventListener("click", () => {
  skipConfirmModal.classList.add("hidden");
});

function finishPractice() {
  stopTicking();
  finishOverlay.classList.remove("hidden");
}

function resetToSetup() {
  stopTicking();
  nextRoutineOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  state.builderInitialized = false;
  showScreen("setup-screen");
}

stopBtn.addEventListener("click", () => {
  if (confirm("연습을 종료하시겠습니까?")) {
    resetToSetup();
  }
});

restartBtn.addEventListener("click", resetToSetup);

// ---- 루틴 종료 알림 (소리 + 화면 흔들림) ----
function triggerShake() {
  timerScreen.classList.remove("shake");
  void timerScreen.offsetWidth; // 애니메이션 재시작을 위한 강제 리플로우
  timerScreen.classList.add("shake");
  timerScreen.addEventListener(
    "animationend",
    () => timerScreen.classList.remove("shake"),
    { once: true }
  );
}

// ---- 알람 (Web Audio API) ----
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playAlarm(times = 4) {
  if (!audioCtx) return;
  const frequencies = [988, 784]; // 두 음을 번갈아 울리는 사이렌 느낌
  let t = audioCtx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = frequencies[i % frequencies.length];
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
    t += 0.4;
  }
}
