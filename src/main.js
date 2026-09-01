import './style.css';
import './mobile.css';

const form = document.querySelector('#vehicle-form');
const steps = [...document.querySelectorAll('.form-step')];
const nextButton = document.querySelector('#next-button');
const backButton = document.querySelector('#back-button');
const submitButton = document.querySelector('#submit-button');
const stepLabel = document.querySelector('#step-label');
const stepTitle = document.querySelector('#step-title');
const progressNumber = document.querySelector('#progress-number');
const progressBar = document.querySelector('#progress-bar');
const range = document.querySelector('#valor');
const rangeValue = document.querySelector('#range-value');
const titles = ['O que você procura?', 'Qual faixa de valor?', 'Como pretende negociar?', 'Qual é o seu prazo?', 'Para onde enviamos?'];
let currentStep = 0;

function isStepValid() {
  const step = steps[currentStep];
  const radios = [...step.querySelectorAll('input[type="radio"]')];
  if (radios.length) return radios.some((input) => input.checked);
  return [...step.querySelectorAll('[required]')].every((input) => input.value.trim() && input.checkValidity());
}

function updateStep() {
  steps.forEach((step, index) => step.classList.toggle('is-active', index === currentStep));
  const progress = ((currentStep + 1) / steps.length) * 100;
  stepLabel.textContent = `Etapa ${currentStep + 1} de ${steps.length}`;
  stepTitle.textContent = titles[currentStep];
  progressNumber.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  backButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  nextButton.disabled = !isStepValid();
  submitButton.disabled = !isStepValid();
}

form.addEventListener('input', (event) => {
  if (event.target === range) rangeValue.textContent = Number(range.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
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
    `Negociação: ${data.get('negociacao')}`,
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
