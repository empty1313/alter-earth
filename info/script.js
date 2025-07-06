/* --- START OF FILE script.js --- */

document.addEventListener('DOMContentLoaded', () => {
    // --- COMMON VARIABLES ---
    const root = document.documentElement;
    const header = document.querySelector('.header');
    const sections = Array.from(document.querySelectorAll('section[id]'));
    const navLinks = document.querySelectorAll('.header .nav-links a');
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');
    const headerHeight = header ? parseInt(getComputedStyle(header).getPropertyValue('height')) : 70;

    // --- SCROLL-SPY FOR NAVIGATION ---
    function updateActiveNavLink() {
        if (!navLinks.length) return;

        let current = 'hero';
        const scrollCenter = window.pageYOffset + window.innerHeight / 2;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - headerHeight;
            const sectionBottom = sectionTop + section.offsetHeight;
            if (scrollCenter >= sectionTop && scrollCenter < sectionBottom) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            // href가 '#'으로 시작하는 링크만 처리 (하위 페이지의 ../index.html#... 링크)
            if (link.getAttribute('href').startsWith('#')) {
                const href = link.getAttribute('href').substring(1);
                if (href === current) {
                    link.classList.add('active');
                }
            }
        });

        // 최상단일 때 Home 활성화
        if (window.pageYOffset < 50) {
            navLinks.forEach(l => l.classList.remove('active'));
            const homeLink = document.querySelector('.nav-links a[href="#hero"]');
            if (homeLink) homeLink.classList.add('active');
        }
    }

    // --- MOBILE HAMBURGER MENU ---
    function setupMobileMenu() {
        if (!hamburgerBtn || !mobileMenu) return;

        hamburgerBtn.addEventListener('click', () => {
            document.body.classList.toggle('mobile-menu-active');
        });

        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                document.body.classList.remove('mobile-menu-active');
            });
        });
    }

    // --- SCROLL-TRIGGERED ANIMATIONS ---
    function setupScrollAnimations() {
        const animatedElements = document.querySelectorAll('[data-animate]');
        if (!animatedElements.length) return;

        const animationOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
        const observer = new IntersectionObserver((entries, observerInstance) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    el.classList.add('visible');
                    el.classList.add(el.dataset.animate);
                    observerInstance.unobserve(el);
                }
            });
        }, animationOptions);

        animatedElements.forEach(el => {
            observer.observe(el);
        });
    }

    // --- INITIALIZE ALL SCRIPTS ---
    updateActiveNavLink(); // Initial check on load
    setupMobileMenu();
    setupScrollAnimations();

    // Add event listeners
    window.addEventListener('scroll', updateActiveNavLink);
});