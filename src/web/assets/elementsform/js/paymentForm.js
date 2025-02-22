class PaymentIntentsElements {
  constructor(publishableKey, container) {
    this.container = container;
    this.formNamespace = this.container.dataset.paymentFormNamespace;
    this.stripeInstance = Stripe(publishableKey);
    this.elements = null;
    this.scenario = this.container.dataset.clientScenario;
    this.completeActionUrl = this.container.dataset.completePaymentActionUrl;
    this.processingButtonText = this.container.dataset.processingButtonText;
  }

  getFormData() {
    return new FormData(this.container.closest('form'));
  }

  showErrorMessage(message) {
    this.container.classList.remove('hidden');
    const errorMessage = this.container.querySelector('.stripe-error-message');
    errorMessage.classList.remove('hidden');
    errorMessage.innerText = message;
  }

  createStripeElementsForm(options) {
    this.elements = this.stripeInstance.elements(options);
    const paymentElement = this.elements.create(
      'payment',
      JSON.parse(this.container.dataset.elementOptions)
    );
    const paymentElementDiv = this.container.querySelector(
      '.stripe-payment-element'
    );
    paymentElement.mount(paymentElementDiv);

    // Listen for the ready event and simulate a window resize:
    const layoutChangeHandler = (e) => {
      window.dispatchEvent(new Event('resize'));
    };

    paymentElement.on('ready', layoutChangeHandler);
    paymentElement.on('change', layoutChangeHandler);

    // Show the container:
    this.container.classList.remove('hidden');
  }

  async requiresActionFlow() {
    const options = {
      clientSecret: this.container.dataset.clientSecret,
      appearance: JSON.parse(this.container.dataset.appearance),
    };

    this.createStripeElementsForm(options);

    const elements = this.elements;
    const {error} = await this.stripeInstance.confirmPayment({
      elements,
      confirmParams: {
        return_url: this.completeActionUrl,
      },
    });
  }

  deprecatedSubscribeFlow() {
    this.showErrorMessage(
      'Can not use the Stripe payment form to subscribe. Please create a payment source first.'
    );
    this.container
      .querySelector('.stripe-payment-elements-submit-button')
      .classList.add('hidden');
  }

  setupIntentFlow() {
    const form = this.getFormData();
    const setupIntentFormData = new FormData();
    setupIntentFormData.append(
      'action',
      'commerce-stripe/customers/create-setup-intent'
    );
    setupIntentFormData.append(window.csrfTokenName, window.csrfTokenValue);
    setupIntentFormData.append('gatewayId', this.container.dataset.gatewayId);
    let responseError = false;

    fetch(window.location.href, {
      method: 'post',
      body: setupIntentFormData,
      headers: {
        Accept: 'application/json',
      },
    })
      .then((res) => {
        if (res.status !== 200) {
          responseError = true;
        }
        return res.json();
      })
      .then((json) => {
        if (responseError) {
          this.showErrorMessage(json.error);
          return;
        }

        const options = {
          clientSecret: json.client_secret,
          appearance: JSON.parse(this.container.dataset.appearance),
        };

        this.createStripeElementsForm(options);

        this.container
          .querySelector('.stripe-payment-elements-submit-button')
          .addEventListener('click', async (event) => {
            event.preventDefault();

            const submitText = this.container.querySelector(
              '.stripe-payment-elements-submit-button'
            ).innerText;
            this.container.querySelector(
              '.stripe-payment-elements-submit-button'
            ).innerText = this.processingButtonText;

            const elements = this.elements;
            const form = this.getFormData();
            const formDataArray = [...form.entries()];
            const params = formDataArray
              .map(
                (x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`
              )
              .join('&');

            this.stripeInstance
              .confirmSetup({
                elements,
                confirmParams: {
                  return_url: `${this.container.dataset.confirmSetupIntentUrl}&${params}`,
                },
              })
              .then((result) => {
                if (result.error) {
                  this.showErrorMessage(result.error.message);
                  this.container.querySelector(
                    '.stripe-payment-elements-submit-button'
                  ).innerText = submitText;
                }
              });
          });
      });
  }

  cartPaymentFlow() {
    const form = this.getFormData();
    let responseError = false;

    fetch(window.location.href, {
      method: 'post',
      body: form,
      headers: {
        Accept: 'application/json',
      },
    })
      .then((res) => {
        if (res.status !== 200) {
          responseError = true;
        }
        return res.json();
      })
      .then((json) => {
        if (responseError) {
          this.container.classList.add('hidden');
          this.showErrorMessage(json.message);
          return;
        }

        const completeActionUrl = new URL(this.completeActionUrl);
        completeActionUrl.searchParams.append(
          'commerceTransactionHash',
          json.transactionHash
        );
        completeActionUrl.searchParams.append(
          'commerceTransactionId',
          json.transactionId
        );
        this.completeActionUrl = completeActionUrl.toString();

        const options = {
          clientSecret: json.redirectData.client_secret,
          appearance: JSON.parse(this.container.dataset.appearance),
        };

        this.createStripeElementsForm(options);

        const updatePaymentIntentForm = new FormData();
        updatePaymentIntentForm.append(
          'action',
          'commerce-stripe/payments/save-payment-intent'
        );
        updatePaymentIntentForm.append(
          window.csrfTokenName,
          window.csrfTokenValue
        );
        updatePaymentIntentForm.append(
          'paymentIntentId',
          json.redirectData.payment_intent
        );
        updatePaymentIntentForm.append(
          'gatewayId',
          this.container.dataset.gatewayId
        );

        const savePaymentSourceCheckbox = this.container
          .closest('form')
          .querySelector('input[name="savePaymentSource"]');

        if (savePaymentSourceCheckbox) {
          savePaymentSourceCheckbox.addEventListener(
            'click',
            function () {
              updatePaymentIntentForm.append(
                'paymentIntent[setup_future_usage]',
                savePaymentSourceCheckbox.checked ? '1' : '0'
              );

              fetch(window.location.href, {
                method: 'post',
                body: updatePaymentIntentForm,
                headers: {
                  Accept: 'application/json',
                },
              })
                .then((response) => response.json())
                .then((data) => {
                  this.elements.fetchUpdates();
                })
                .catch((error) => {
                  console.error(
                    'There was an error updating the Payment Intent:',
                    error
                  );
                });
            }.bind(this)
          );
        }

        this.container
          .querySelector('.stripe-payment-elements-submit-button')
          .addEventListener('click', async (event) => {
            event.preventDefault();

            const submitText = this.container.querySelector(
              '.stripe-payment-elements-submit-button'
            ).innerText;
            this.container.querySelector(
              '.stripe-payment-elements-submit-button'
            ).innerText = this.processingButtonText;

            const elements = this.elements;
            const {error} = await this.stripeInstance.confirmPayment({
              elements,
              confirmParams: {
                return_url: this.completeActionUrl,
              },
            });
            this.container.querySelector(
              '.stripe-payment-elements-submit-button'
            ).innerText = submitText;
            this.showErrorMessage(error.message);
          });
      });
  }

  handle() {
    const formData = this.getFormData();
    const action = formData.get('action');

    if (this.scenario === 'payment') {
      if (action.includes('commerce/payments/pay')) {
        this.cartPaymentFlow();
      } else if (action.includes('commerce/payment-sources/add')) {
        this.setupIntentFlow();
      } else if (action.includes('commerce/subscriptions/subscribe')) {
        this.deprecatedSubscribeFlow();
      }
    }

    if (this.scenario === 'requires_action') {
      this.requiresActionFlow();
    }
  }
}

function initStripe() {
  if (typeof Stripe === 'undefined') {
    setTimeout(initStripe, 200);
  } else {
    document
      .querySelectorAll('.stripe-payment-elements-form')
      .forEach((container) => {
        const handlerInstance = new PaymentIntentsElements(
          container.dataset.publishablekey,
          container
        );
        container.dataset.handlerInstance = handlerInstance;
        handlerInstance.handle();
      });
  }
}

initStripe();
