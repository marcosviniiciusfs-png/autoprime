import './style.css';
import './mobile.css';
import './form-r2.css';

// GitHub Pages build revision: assets are resolved relative to the page.

const form = document.querySelector('#vehicle-form');
const steps = [...document.querySelectorAll('.form-step')];
const nextButton = document.querySelector('#next-button');
const backButton = document.querySelector('#back-button');
const submitButton = document.querySelector('#submit-button');
const stepLabel = document.querySelector('#step-label');
const stepTitle = document.querySelector('#step-title');
const progressBar = document.querySelector('#progress-bar');
const titles = ['Seu objetivo', 'Valor desejado', 'Entrada disponível', 'Parcela mensal', 'Prazo', 'Seus dados'];
let currentStep = 0;

function isStepValid() {
  const step = steps[currentStep];
  const radios = [...step.querySelectorAll('input[type="radio"]')];
  if (radios.length) return radios.some((input) => input.checked);
  return [...step.querySelectorAll('[required]')].every((input) => input.value.trim() && input.checkValidity());
}

function updateStep() {
  form.dataset.currentStep = String(currentStep);
  steps.forEach((step, index) => step.classList.toggle('is-active', index === currentStep));
  const progress = ((currentStep + 1) / steps.length) * 100;
  stepLabel.textContent = `Etapa ${currentStep + 1} de ${steps.length}`;
  stepTitle.textContent = titles[currentStep];
  progressBar.style.width = `${progress}%`;
  backButton.disabled = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  nextButton.disabled = !isStepValid();
  submitButton.disabled = !isStepValid();
}

form.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'whatsapp') {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) event.target.value = digits;
    else if (digits.length <= 7) event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    else event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length === 11 ? 7 : 6)}-${digits.slice(digits.length === 11 ? 7 : 6)}`;
  }
  nextButton.disabled = !isStepValid();
  submitButton.disabled = !isStepValid();
});

nextButton.addEventListener('click', () => {
  if (!isStepValid()) return;
  currentStep += 1;
  updateStep();
});

backButton.addEventListener('click', () => {
  currentStep -= 1;
  updateStep();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (currentStep !== steps.length - 1 || !isStepValid()) return;
  const data = new FormData(form);
  const message = [
    'Olá, Auto Prime! Fiz uma simulação pelo site:',
    '',
    `Nome: ${data.get('nome')}`,
    `WhatsApp: ${data.get('whatsapp')}`,
    `Cidade: ${data.get('cidade')}`,
    `Objetivo: ${data.get('objetivo')}`,
    `Valor aproximado: ${Number(data.get('valor')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`,
    `Entrada disponível: ${data.get('entrada')}`,
    `Parcela ideal: ${data.get('parcela')}`,
    `Prazo: ${data.get('prazo')}`,
  ].join('\n');
  window.open(`https://wa.me/5593991207140?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
updateStep();
