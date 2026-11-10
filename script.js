
    const form = document.getElementById('search-form');
    const input = document.getElementById('city-input');
    const searchButton = document.getElementById('search-button');
    const locationButton = document.getElementById('location-button');
    const loading = document.getElementById('loading');
    const message = document.getElementById('message');
    const initial = document.getElementById('initial');
    const choices = document.getElementById('choices');
    const choiceList = document.getElementById('choice-list');
    const resultPanel = document.getElementById('result');
    let controller = null;

    function weatherFor(code, isDay = true) {
      if (code === 0) return ['Céu limpo', isDay ? '☀️' : '🌙'];
      if ([1, 2].includes(code)) return ['Parcialmente nublado', isDay ? '🌤️' : '☁️'];
      if (code === 3) return ['Nublado', '☁️'];
      if ([45, 48].includes(code)) return ['Névoa', '🌫️'];
      if ([51, 53, 55, 56, 57].includes(code)) return ['Garoa', '🌦️'];
      if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Chuva', '🌧️'];
      if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Neve', '❄️'];
      if ([95, 96, 99].includes(code)) return ['Trovoadas', '⛈️'];
      return ['Condição não disponível', '🌥️'];
    }
    function setBusy(active) {
      loading.hidden = !active;
      searchButton.disabled = active;
      locationButton.disabled = active;
      input.setAttribute('aria-busy', String(active));
    }
    function clearViews() {
      initial.hidden = true;
      choices.hidden = true;
      resultPanel.hidden = true;
      message.hidden = true;
    }
    function showError(text) {
      message.textContent = text;
      message.hidden = false;
      choices.hidden = true;
    }
    function beginRequest() {
      if (controller) controller.abort();
      controller = new AbortController();
      clearViews();
      setBusy(true);
      return controller.signal;
    }
    async function fetchJSON(url, signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('Não foi possível consultar o serviço meteorológico. Tente novamente.');
      return response.json();
    }
    function placeName(place) {
      return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    }
    function formatDate(date) {
      const [year, month, day] = date.split('-').map(Number);
      return new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
    }
    function clock(value) {
      return typeof value === 'string' && value.includes('T') ? value.split('T')[1].slice(0, 5) : '';
    }
    function renderWeather(place, data) {
      const current = data.current;
      const daily = data.daily;
      if (!current || !daily || !Array.isArray(daily.time) || !daily.time.length ||
          current.temperature_2m == null || current.relative_humidity_2m == null ||
          current.apparent_temperature == null || current.wind_speed_10m == null) {
        throw new Error('A previsão desta localidade está incompleta. Tente outra cidade.');
      }
      const [description, icon] = weatherFor(current.weather_code, current.is_day !== 0);
      document.getElementById('location-name').textContent = placeName(place);
      document.getElementById('weather-icon').textContent = icon;
      document.getElementById('condition').textContent = description;
      document.getElementById('temperature').textContent = `${Math.round(current.temperature_2m)} °C`;
      document.getElementById('feels').textContent = `${Math.round(current.apparent_temperature)} °C`;
      document.getElementById('humidity').textContent = `${Math.round(current.relative_humidity_2m)}%`;
      document.getElementById('wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
      for (const key of ['sunrise', 'sunset']) {
        const value = clock(daily[key]?.[0]);
        document.getElementById(key + '-metric').hidden = !value;
        if (value) document.getElementById(key).textContent = value;
      }
      const days = document.getElementById('days');
      days.replaceChildren();
      daily.time.slice(0, 5).forEach((date, index) => {
        const card = document.getElementById('day-template').content.cloneNode(true);
        const [summary, symbol] = weatherFor(daily.weather_code?.[index]);
        card.querySelector('[data-template-id="day-name"]').textContent = index === 0 ? 'Hoje' : formatDate(date);
        card.querySelector('.day-icon').textContent = symbol;
        card.querySelector('[data-template-id="day-condition"]').textContent = summary;
        const high = daily.temperature_2m_max?.[index];
        const low = daily.temperature_2m_min?.[index];
        card.querySelector('[data-template-id="day-high"]').textContent = high == null ? '—' : `${Math.round(high)}°`;
        card.querySelector('[data-template-id="day-low"]').textContent = low == null ? '' : ` / ${Math.round(low)}°`;
        days.appendChild(card);
      });
      message.hidden = true;
      choices.hidden = true;
      resultPanel.hidden = false;
    }
    async function loadWeather(place, signal) {
      choices.hidden = true;
      resultPanel.hidden = true;
      message.hidden = true;
      setBusy(true);
      try {
        const params = new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code,is_day',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
          temperature_unit: 'celsius',
          wind_speed_unit: 'kmh',
          timezone: 'auto',
          forecast_days: '5'
        });
        const data = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`, signal);
        if (!signal.aborted) renderWeather(place, data);
      } catch (error) {
        if (!signal.aborted) showError(error.name === 'AbortError' ? 'Consulta cancelada.' : error.message || 'Não foi possível carregar a previsão.');
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const city = input.value.trim();
      if (city.length < 2) {
        showError('Digite pelo menos duas letras para pesquisar.');
        input.focus();
        return;
      }
      const signal = beginRequest();
      try {
        const params = new URLSearchParams({ name:city, count:'8', language:'pt', format:'json' });
        const data = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
        if (signal.aborted) return;
        const places = data.results || [];
        if (!places.length) { showError('Nenhuma cidade encontrada. Confira o nome e tente novamente.'); return; }
        if (places.length === 1) { await loadWeather(places[0], signal); return; }
        choiceList.replaceChildren();
        places.forEach(place => {
          const fragment = document.getElementById('choice-template').content.cloneNode(true);
          const button = fragment.querySelector('button');
          button.textContent = placeName(place);
          button.addEventListener('click', () => {
            const nextSignal = beginRequest();
            loadWeather(place, nextSignal);
          });
          choiceList.appendChild(fragment);
        });
        choices.hidden = false;
        choiceList.querySelector('button')?.focus();
      } catch (error) {
        if (!signal.aborted) showError(error.message || 'Não foi possível pesquisar agora. Tente novamente.');
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    });
    locationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showError('Seu navegador não disponibiliza localização. Pesquise uma cidade pelo nome.');
        return;
      }
      const signal = beginRequest();
      navigator.geolocation.getCurrentPosition(
        position => {
          if (signal.aborted) return;
          const { latitude, longitude } = position.coords;
          loadWeather({ name:'Sua localização aproximada', latitude, longitude }, signal);
        },
        error => {
          if (signal.aborted) return;
          const text = error.code === 1
            ? 'A permissão de localização foi negada. Pesquise uma cidade pelo nome.'
            : 'Não foi possível obter sua localização. Pesquise uma cidade pelo nome.';
          showError(text);
          setBusy(false);
        },
        { enableHighAccuracy:false, timeout:12000, maximumAge:300000 }
      );
    });
    if (window.lucide) lucide.createIcons();