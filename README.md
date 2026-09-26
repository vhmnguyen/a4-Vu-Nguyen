# D&D Party Tracker

Hosted application: https://a4-vu-nguyen.onrender.com

D&D Party Tracker lets users create an account and manage their own adventuring party. Users can add, view, edit, and delete characters and adjust their hit points. Character status is calculated by the server, and MongoDB stores accounts, characters, and login sessions.

## Changes from Assignment 3

Rebuilt the character management interface using React components for the tracker, character form, character table and rows, and status/error messages. React state and event handlers replace the manual DOM updates from Assignment 3. Vite handles frontend development and production builds, while the Express backend, MongoDB storage, Bootstrap styling, and existing login interface remain in use.

## Development Experience

React improved the development experience by keeping the character list, form values, and feedback in state instead of updating individual page elements manually. 
Splitting the interface into components made the code easier to organize and maintain. 
Setting up Vite was a bit tough because development needed an API proxy and production needed a separate frontend build.