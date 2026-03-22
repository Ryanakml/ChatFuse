'use client';

import { createPortal } from 'react-dom';

export function EarlyAccessModalPortal() {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal fade"
      id="earlyAccessModal"
      tabIndex={-1}
      aria-labelledby="earlyAccessModalLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-md">
        <div className="modal-content rounded-4 border-0 shadow">
          <div className="modal-body p-4 p-md-5">
            <div id="early-access-form-state">
              <span className="badge text-bg-light mb-3">EARLY ACCESS</span>
              <h2 className="h3 mb-3" id="earlyAccessModalLabel">
                You&apos;re Early. That&apos;s a Good Thing.
              </h2>
              <p className="mb-4">
                Chattiphy is currently in private beta. Join the waitlist and we&apos;ll reach out
                when your spot is ready.
              </p>

              <form id="early-access-form">
                <div className="mb-3">
                  <label htmlFor="earlyAccessName" className="form-label">
                    Name
                  </label>
                  <input
                    id="earlyAccessName"
                    name="name"
                    type="text"
                    className="form-control"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="earlyAccessEmail" className="form-label">
                    Email
                  </label>
                  <input
                    id="earlyAccessEmail"
                    name="email"
                    type="email"
                    className="form-control"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="earlyAccessClinicType" className="form-label">
                    Clinic Type
                  </label>
                  <select
                    id="earlyAccessClinicType"
                    name="clinic_type"
                    className="form-control"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select clinic type
                    </option>
                    <option value="General Clinic">General Clinic</option>
                    <option value="Beauty & Aesthetic">Beauty &amp; Aesthetic</option>
                    <option value="Solo Practitioner">Solo Practitioner</option>
                    <option value="Dental">Dental</option>
                    <option value="Mental Health">Mental Health</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <button type="submit" className="btn w-100">
                  Reserve My Spot
                </button>
                <p className="small text-center mt-3 mb-0">
                  No spam. No commitment. Just early access.
                </p>
              </form>
            </div>

            <div id="early-access-thankyou-state" className="d-none text-center">
              <h2 className="h3 mb-3">You&apos;re on the list.</h2>
              <p className="mb-0">We&apos;ll be in touch soon. Keep an eye on your inbox.</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
