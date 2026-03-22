(function () {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
      return;
    }
    fn();
  }

  function applyStoredTheme() {
    try {
      var storedTheme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-bs-theme', storedTheme);
    } catch {
      document.documentElement.setAttribute('data-bs-theme', 'light');
    }
  }

  function initSectionActiveLink() {
    var sections = document.querySelectorAll('.section');
    var navLinks = document.querySelectorAll('.fbs__net-navbar .scroll-link');

    function removeActiveClasses() {
      navLinks.forEach(function (link) {
        link.classList.remove('active');
      });
    }

    function addActiveClass(currentSectionId) {
      var activeLink = document.querySelector(
        '.fbs__net-navbar .scroll-link[href="#' + currentSectionId + '"]',
      );
      if (activeLink) {
        activeLink.classList.add('active');
      }
    }

    function getCurrentSection() {
      var currentSection = null;
      var minDistance = Infinity;

      sections.forEach(function (section) {
        var rect = section.getBoundingClientRect();
        var distance = Math.abs(rect.top - window.innerHeight / 4);

        if (distance < minDistance && rect.top < window.innerHeight) {
          minDistance = distance;
          currentSection = section.getAttribute('id');
        }
      });

      return currentSection;
    }

    function updateActiveLink() {
      var currentSectionId = getCurrentSection();
      if (!currentSectionId) {
        return;
      }
      removeActiveClasses();
      addActiveClass(currentSectionId);
    }

    updateActiveLink();
    window.addEventListener('scroll', updateActiveLink);
  }

  function initNavbarScroll() {
    var navbar = document.querySelector('.fbs__net-navbar');
    if (!navbar) {
      return;
    }

    var onScroll = function () {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop > 0) {
        navbar.classList.add('active');
      } else {
        navbar.classList.remove('active');
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll);
  }

  function initDropdownHover() {
    function addHoverEvents(dropdown) {
      if (dropdown.__events) {
        return;
      }

      var dropdownToggle = dropdown.querySelector('.dropdown-toggle');
      if (!dropdownToggle) {
        return;
      }

      var preventClick = function (event) {
        event.preventDefault();
      };
      var showDropdown = function () {
        dropdown.classList.add('show');
        dropdownToggle.setAttribute('aria-expanded', 'true');
        var dropdownMenu = dropdown.querySelector('.dropdown-menu');
        if (dropdownMenu) {
          dropdownMenu.classList.add('show');
        }
      };
      var hideDropdown = function () {
        dropdown.classList.remove('show');
        dropdownToggle.setAttribute('aria-expanded', 'false');
        var dropdownMenu = dropdown.querySelector('.dropdown-menu');
        if (dropdownMenu) {
          dropdownMenu.classList.remove('show');
        }
      };

      dropdownToggle.addEventListener('click', preventClick);
      dropdown.addEventListener('mouseover', showDropdown);
      dropdown.addEventListener('mouseleave', hideDropdown);

      dropdown.__events = {
        preventClick: preventClick,
        showDropdown: showDropdown,
        hideDropdown: hideDropdown,
      };
    }

    function removeHoverEvents(dropdown) {
      var dropdownToggle = dropdown.querySelector('.dropdown-toggle');
      var events = dropdown.__events;

      if (!dropdownToggle || !events) {
        return;
      }

      dropdownToggle.removeEventListener('click', events.preventClick);
      dropdown.removeEventListener('mouseover', events.showDropdown);
      dropdown.removeEventListener('mouseleave', events.hideDropdown);
      delete dropdown.__events;
    }

    function updateByViewport() {
      var dropdowns = document.querySelectorAll(
        '.navbar .dropdown, .navbar .dropstart, .navbar .dropend',
      );

      if (window.innerWidth >= 992) {
        dropdowns.forEach(addHoverEvents);
      } else {
        dropdowns.forEach(removeHoverEvents);
      }
    }

    updateByViewport();
    window.addEventListener('resize', updateByViewport);
  }

  function initOffcanvasBodyClass() {
    var offcanvasElement = document.getElementById('fbs__net-navbars');
    if (!offcanvasElement) {
      return;
    }

    offcanvasElement.addEventListener('show.bs.offcanvas', function () {
      document.body.classList.add('offcanvas-active');
    });

    offcanvasElement.addEventListener('hidden.bs.offcanvas', function () {
      document.body.classList.remove('offcanvas-active');
    });
  }

  function initBackToTop() {
    var backToTopButton = document.getElementById('back-to-top');
    if (!backToTopButton) {
      return;
    }

    var onScroll = function () {
      if (window.scrollY > 170) {
        backToTopButton.classList.add('show');
      } else {
        backToTopButton.classList.remove('show');
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll);

    backToTopButton.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  }

  function initInlineSvg() {
    var imgElements = document.querySelectorAll('.js-img-to-inline-svg');

    imgElements.forEach(function (imgElement) {
      var imgURL = imgElement.getAttribute('src');
      if (!imgURL) {
        return;
      }

      fetch(imgURL)
        .then(function (response) {
          return response.text();
        })
        .then(function (svgText) {
          var parser = new DOMParser();
          var svgDocument = parser.parseFromString(svgText, 'image/svg+xml');
          var svgElement = svgDocument.documentElement;

          Array.from(imgElement.attributes).forEach(function (attr) {
            if (attr.name !== 'class') {
              svgElement.setAttribute(attr.name, attr.value);
              return;
            }

            var classes = attr.value.split(' ').filter(function (className) {
              return className !== 'js-img-to-inline-svg';
            });

            if (classes.length > 0) {
              svgElement.setAttribute('class', classes.join(' '));
            }
          });

          imgElement.replaceWith(svgElement);
        })
        .catch(function (error) {
          console.error('Error fetching SVG:', error);
        });
    });
  }

  function initAos() {
    if (window.AOS) {
      window.AOS.init({
        duration: 800,
        easing: 'slide',
        once: true,
      });
    }
  }

  function initPureCounter() {
    if (window.PureCounter) {
      new window.PureCounter({
        selector: '.purecounter',
      });
    }
  }

  function initGlightbox() {
    if (window.GLightbox) {
      window.GLightbox({
        touchNavigation: true,
        loop: true,
        autoplayVideos: true,
      });
    }
  }

  function initLandingTracking() {
    var supabaseUrl = window.__LANDING_SUPABASE_URL;
    var supabaseAnonKey = window.__LANDING_SUPABASE_ANON_KEY;
    var supabaseGlobal = window.supabase;
    var sessionStorageKey = 'landing_session_key';
    var eventBuffer = [];
    var pageStartMs = Date.now();
    var pageExitSent = false;

    function noop() {}

    if (!supabaseUrl || !supabaseAnonKey || !supabaseGlobal || !supabaseGlobal.createClient) {
      return {
        trackEvent: noop,
        trackClick: noop,
        submitWhitelist: noop,
      };
    }

    var createClient = supabaseGlobal.createClient;
    var supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    var generatedSessionKey = btoa(navigator.userAgent + new Date().toDateString()).slice(0, 32);
    var sessionKey = generatedSessionKey;

    try {
      var storedSessionKey = localStorage.getItem(sessionStorageKey);
      if (storedSessionKey && storedSessionKey === generatedSessionKey) {
        sessionKey = storedSessionKey;
      } else {
        localStorage.setItem(sessionStorageKey, generatedSessionKey);
      }
    } catch {
      sessionKey = generatedSessionKey;
    }

    function upsertSession(eventPayload) {
      try {
        eventBuffer.push(eventPayload);
        var nowIso = new Date().toISOString();
        void supabaseClient
          .from('landing_sessions')
          .upsert(
            {
              session_key: sessionKey,
              last_seen_at: nowIso,
              referrer: document.referrer || null,
              user_agent: navigator.userAgent || null,
              events: eventBuffer,
            },
            { onConflict: 'session_key', ignoreDuplicates: false },
          )
          .then(function () {
            // non-blocking
          })
          .catch(function () {
            // non-blocking
          });
      } catch {
        // non-blocking
      }
    }

    function trackEvent(type, additionalPayload) {
      try {
        var eventPayload = {
          type: type,
          timestamp: new Date().toISOString(),
        };

        if (additionalPayload && typeof additionalPayload === 'object') {
          Object.keys(additionalPayload).forEach(function (key) {
            eventPayload[key] = additionalPayload[key];
          });
        }

        upsertSession(eventPayload);
      } catch {
        // non-blocking
      }
    }

    function trackClick(targetLabel) {
      trackEvent('click', {
        target_label: targetLabel,
      });
    }

    function submitWhitelist(payload) {
      try {
        void supabaseClient
          .from('whitelist_signups')
          .insert({
            session_key: sessionKey,
            name: payload.name || null,
            email: payload.email || null,
            clinic_type: payload.clinicType || null,
          })
          .then(function () {
            // non-blocking
          })
          .catch(function () {
            // non-blocking
          });
      } catch {
        // non-blocking
      }
    }

    function initScrollDepthTracking() {
      var thresholds = [25, 50, 75, 100];
      var firedThresholds = {};

      function computeScrollPercent() {
        var doc = document.documentElement;
        var scrollableHeight = doc.scrollHeight - window.innerHeight;
        if (scrollableHeight <= 0) {
          return 100;
        }
        return Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100));
      }

      function onScroll() {
        var percent = computeScrollPercent();
        thresholds.forEach(function (threshold) {
          if (percent >= threshold && !firedThresholds[threshold]) {
            firedThresholds[threshold] = true;
            trackEvent('scroll_depth', { depth_percent: threshold });
          }
        });
      }

      onScroll();
      window.addEventListener('scroll', onScroll);
    }

    function initClickTracking() {
      document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) {
          return;
        }

        var clickable =
          event.target.closest('.fbs__net-navbar a.nav-link') ||
          event.target.closest('a.btn, button.btn') ||
          event.target.closest('#pricing a, #pricing button') ||
          event.target.closest('#faq .accordion-button');

        if (!clickable) {
          return;
        }

        var label = (clickable.textContent || '').replace(/\s+/g, ' ').trim();
        if (!label) {
          label =
            clickable.getAttribute('aria-label') || clickable.getAttribute('href') || 'unknown';
        }

        if (clickable.closest('#faq')) {
          trackClick('FAQ: ' + label);
        } else {
          trackClick(label);
        }
      });
    }

    function sendPageExitEvent() {
      if (pageExitSent) {
        return;
      }
      pageExitSent = true;

      trackEvent(
        'page_exit',
        {
          time_on_page_seconds: Math.max(0, Math.round((Date.now() - pageStartMs) / 1000)),
        },
      );
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        sendPageExitEvent();
      }
    });
    window.addEventListener('beforeunload', sendPageExitEvent);

    trackEvent('page_enter', {
      referrer: document.referrer || null,
    });

    initScrollDepthTracking();
    initClickTracking();

    return {
      trackEvent: trackEvent,
      trackClick: trackClick,
      submitWhitelist: submitWhitelist,
    };
  }

  function initEarlyAccessModal(tracking) {
    var modalElement = document.getElementById('earlyAccessModal');
    if (!modalElement || !window.bootstrap || !window.bootstrap.Modal) {
      return;
    }

    var modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    var form = document.getElementById('early-access-form');
    var formState = document.getElementById('early-access-form-state');
    var thankYouState = document.getElementById('early-access-thankyou-state');

    function resetModalState() {
      if (formState && thankYouState) {
        formState.classList.remove('d-none');
        thankYouState.classList.add('d-none');
      }
      if (form) {
        form.reset();
      }
    }

    modalElement.addEventListener('shown.bs.modal', function () {
      tracking.trackEvent('modal_open');
    });

    modalElement.addEventListener('hidden.bs.modal', function () {
      resetModalState();
      tracking.trackEvent('modal_close');
    });

    document.addEventListener('click', function (event) {
      if (!(event.target instanceof Element)) {
        return;
      }

      var dashboardLink = event.target.closest('a[href="/dashboard"]');
      if (!dashboardLink) {
        return;
      }

      event.preventDefault();
      modal.show();
    });

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();

        var nameInput = form.querySelector('input[name="name"]');
        var emailInput = form.querySelector('input[name="email"]');
        var clinicTypeInput = form.querySelector('select[name="clinic_type"]');

        var clinicType = clinicTypeInput ? clinicTypeInput.value : '';

        tracking.submitWhitelist({
          name: nameInput ? nameInput.value : '',
          email: emailInput ? emailInput.value : '',
          clinicType: clinicType,
        });

        tracking.trackEvent('form_submit', {
          clinic_type: clinicType || null,
        });

        if (formState && thankYouState) {
          formState.classList.add('d-none');
          thankYouState.classList.remove('d-none');
        }
      });
    }
  }

  onReady(function () {
    applyStoredTheme();
    initSectionActiveLink();
    initNavbarScroll();
    initDropdownHover();
    initOffcanvasBodyClass();
    initBackToTop();
    initInlineSvg();
    initAos();
    initPureCounter();
    initGlightbox();

    var tracking = initLandingTracking();
    initEarlyAccessModal(tracking);
  });
})();
